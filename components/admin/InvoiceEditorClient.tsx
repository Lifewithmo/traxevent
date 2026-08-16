'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Receipt, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { StatusPill } from '@/components/ui/status-pill'
import {
  updateInvoice, sendInvoice, voidInvoice, deleteInvoice, recordPayment,
} from '@/actions/invoices'
import { InvoiceCatalogPicker } from '@/components/admin/InvoiceCatalogPicker'
import { SendInvoiceDialog } from '@/components/admin/SendInvoiceDialog'
import {
  lineItemSubtotal, linesSubtotal, amountPaid,
  invoiceDiscountAmount, invoiceTaxAmount, invoiceAmountDue,
} from '@/lib/invoices'
import { invoicePill } from '@/lib/invoice-presentation'
import { derivePaymentStatus, deriveAging, resolveTipsEnabled } from '@/lib/invoice-status'
import type {
  NormalizedInvoice, InvoiceLineItem, InvoiceDiscount, InvoiceSourceRef, OrgBranding,
} from '@/lib/types'

interface InvoiceEditorClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoice: NormalizedInvoice
  orgTipsEnabled?: boolean
  customerName?: string
  customerEmail?: string
  branding?: OrgBranding
}

const money = (n: number) => `$${n.toFixed(2)}`

// Parse a numeric text field: empty → 0, NaN guarded to 0.
function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

// A row is "fully blank" when nothing meaningful has been typed into it: no
// description and no price. Quantity is deliberately not part of the test —
// `addRow` seeds it to 1, so requiring `quantity === 0` here meant a freshly
// added, untouched row was never filtered and shipped to the customer as an
// empty line.
function isBlankRow(item: InvoiceLineItem): boolean {
  return item.description.trim() === '' && !(item.unit_price > 0)
}

// The discount as it should be persisted: dropped entirely when it carries no
// value, and with `reason` OMITTED (not blanked) when the operator clears it.
// The key has to be absent rather than undefined — `discount` is written as a
// whole map, and a nested `undefined` is what Firestore rejects.
function cleanDiscount(discount?: InvoiceDiscount): InvoiceDiscount | undefined {
  if (!discount || !(discount.value > 0)) return undefined
  const reason = discount.reason?.trim()
  return reason
    ? { type: discount.type, value: discount.value, reason }
    : { type: discount.type, value: discount.value }
}

const DELIVERY_FAILED_WARNING = 'Invoice sent — email delivery failed. Use Send update to retry.'

// Whole days past the due date; negative when still ahead of it.
function daysPastDue(dueDate: string, now: Date): number {
  const due = new Date(`${dueDate}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - due.getTime()) / 86_400_000)
}

// The one interpretation line under the balance — a bare figure is decoration,
// this is what turns it into a decision. Mirrors the four states an operator
// can actually be in when looking at this invoice.
function balanceNote(input: {
  balance: number
  paid: number
  total: number
  dueDate?: string
  isDraft: boolean
  isVoid: boolean
}): { text: string; destructive: boolean } {
  const { balance, paid, total, dueDate, isDraft, isVoid } = input
  // A voided invoice is never owed, so it can never be overdue — check this
  // before the due-date branch or a cancelled invoice reads as delinquent.
  if (isVoid) return { text: 'Voided — no payment due', destructive: false }
  if (balance <= 0 && total > 0) return { text: 'Paid in full', destructive: false }
  if (isDraft) return { text: 'Not sent yet', destructive: false }
  if (dueDate) {
    const d = daysPastDue(dueDate, new Date())
    if (d > 0) return { text: `${d} day${d === 1 ? '' : 's'} overdue`, destructive: true }
  }
  if (paid > 0) return { text: `${money(paid)} of ${money(total)} paid`, destructive: false }
  return { text: 'Awaiting payment', destructive: false }
}

export function InvoiceEditorClient({
  orgId, orgSlug, leadId, invoice, orgTipsEnabled, customerName, customerEmail, branding,
}: InvoiceEditorClientProps) {
  const router = useRouter()

  const [title, setTitle] = useState(invoice.title ?? '')
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(invoice.line_items ?? [])
  const [discount, setDiscount] = useState<InvoiceDiscount | undefined>(invoice.discount)
  const [taxRate, setTaxRate] = useState<string>(invoice.tax_rate != null ? String(invoice.tax_rate) : '')

  const isDraft = invoice.lifecycle === 'draft'
  const isVoid = invoice.lifecycle === 'void'
  // Drafts are always live; a sent invoice stays read-only until explicitly unlocked.
  const [editing, setEditing] = useState(isDraft)

  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Seeded from the persisted delivery status, not just this session's send —
  // a bounced invoice must still show the cue after a reload.
  const [warning, setWarning] = useState<string | null>(
    invoice.delivery === 'bounced' ? DELIVERY_FAILED_WARNING : null,
  )
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const payAmountRef = useRef<HTMLInputElement>(null)
  // Belt and braces behind <ConfirmDialog>'s own guard. A state flag cannot do
  // this job: two activations inside one commit window share the same closure, so
  // both would read the pre-click value. A ref flips synchronously.
  const destructiveInFlight = useRef(false)

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payNote, setPayNote] = useState('')
  const [tipAmount, setTipAmount] = useState('')

  const locked = !editing || isVoid
  const tipsOn = resolveTipsEnabled(invoice.tips_enabled, orgTipsEnabled)
  const showLink = !isDraft
  const versions = invoice.versions ?? []

  const shareLink =
    typeof window !== 'undefined' ? `${window.location.origin}/invoices/${invoice.token}` : `/invoices/${invoice.token}`

  function updateRow(index: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addRow() {
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }])
  }

  function removeRow(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePick(item: { description: string; unit_price: number; source?: InvoiceSourceRef }) {
    setLineItems((prev) => [
      ...prev,
      { description: item.description, quantity: 1, unit_price: item.unit_price, taxable: true, ...(item.source ? { source: item.source } : {}) },
    ])
  }

  // The cleaned payload shared by Save and Send, so an unsaved edit rides along
  // with the send instead of being silently dropped.
  function currentUpdates() {
    const cleaned = lineItems.filter((item) => !isBlankRow(item))
    const taxRateNum = taxRate.trim() === '' ? undefined : toNumber(taxRate)
    return {
      cleaned,
      payload: {
        title: title.trim() || undefined,
        due_date: dueDate || undefined,
        notes: notes.trim() || undefined,
        line_items: cleaned,
        discount: cleanDiscount(discount),
        tax_rate: taxRateNum && taxRateNum > 0 ? taxRateNum : undefined,
      },
    }
  }

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const { payload } = currentUpdates()
      await updateInvoice(orgId, invoice.id, payload)
      // Functional update, not the pre-await `cleaned` array — the fields stay
      // editable during the round-trip, so restoring the snapshot would silently
      // discard anything typed while the save was in flight.
      setLineItems((prev) => prev.filter((item) => !isBlankRow(item)))
      setNotice('Saved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleSend({ to, message }: { to: string; message?: string }) {
    setError(null); setNotice(null)
    const { payload } = currentUpdates()
    // Deliberately not clearing `warning` here: if this retry itself throws, the
    // standing "email delivery failed" cue must survive, or a failed retry leaves
    // the operator with nothing but the dialog's inline error.
    try {
      const result = await sendInvoice(orgId, invoice.id, { to, message, updates: payload })
      // Re-filter live state rather than restoring the array captured before the
      // await, which would discard anything typed while the send was in flight.
      setLineItems((prev) => prev.filter((item) => !isBlankRow(item)))
      setEditing(false)
      if (result && result.emailDelivered === false) {
        setWarning(DELIVERY_FAILED_WARNING)
      } else {
        setWarning(null)
        setNotice(showLink ? 'Update sent.' : 'Invoice sent.')
      }
      router.refresh()
    } catch (err) {
      // sendInvoice can commit the number and lifecycle and still throw afterwards.
      // Without this the editor keeps rendering Draft chrome for an invoice that is
      // already sent and numbered. Rethrow so the dialog still shows the error.
      router.refresh()
      throw err
    }
  }

  // Both destructive paths are gated by <ConfirmDialog> at the bottom of the
  // tree, not by window.confirm — these run only after the operator committed.
  async function handleVoid() {
    if (destructiveInFlight.current) return
    destructiveInFlight.current = true
    setVoiding(true); setError(null); setNotice(null)
    try {
      await voidInvoice(orgId, invoice.id)
      setNotice('Invoice voided.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to void')
    } finally { setVoiding(false); destructiveInFlight.current = false }
  }

  async function handleDelete() {
    if (destructiveInFlight.current) return
    destructiveInFlight.current = true
    setDeleting(true); setError(null); setNotice(null)
    try {
      await deleteInvoice(orgId, invoice.id)
      // The guard is deliberately left armed on success: the route is changing and
      // this tree is unmounting, so a second delete could only race a record that
      // is already gone and setState on a component on its way out.
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      destructiveInFlight.current = false
    }
  }

  async function handleRecordPayment() {
    setRecording(true); setError(null); setNotice(null)
    try {
      const amount = toNumber(payAmount)
      if (!(amount > 0)) throw new Error('Payment amount must be positive')
      await recordPayment(orgId, invoice.id, {
        amount,
        method: payMethod.trim() || undefined,
        note: payNote.trim() || undefined,
        ...(tipsOn ? { tip_amount: toNumber(tipAmount) || undefined } : {}),
      })
      setPayAmount(''); setPayMethod(''); setPayNote(''); setTipAmount('')
      setNotice('Payment recorded.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally { setRecording(false) }
  }

  async function handleCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
    } catch {
      setError('Could not copy link.')
    }
  }

  const taxRateNum = taxRate.trim() === '' ? undefined : toNumber(taxRate)
  const subtotal = linesSubtotal(lineItems)
  const discountAmt = invoiceDiscountAmount(subtotal, discount)
  const taxAmt = invoiceTaxAmount(subtotal - discountAmt, taxRateNum)
  const credits = invoice.credits ?? []
  const totalDue = invoiceAmountDue({ line_items: lineItems, discount, tax_rate: taxRateNum, credits })
  const paid = amountPaid(invoice.payments)
  // Balance tracks the *edited* document, not the saved one — Total and Balance
  // disagreeing mid-edit is the single most confusing thing this screen could do.
  const balance = Math.round((totalDue - paid) * 100) / 100
  const busy = saving || voiding || deleting || recording
  // A locked document shows only the lines that carry a figure; the zeroed
  // discount/tax controls are editor chrome, not part of the invoice.
  const showDiscountRow = !locked || discountAmt > 0
  const showTaxRow = !locked || taxAmt > 0
  const note = balanceNote({ balance, paid, total: totalDue, dueDate: dueDate || undefined, isDraft, isVoid })

  // One pill, driven by money state rather than lifecycle: every sent invoice
  // used to read the same neutral "Sent" whether it was paid, half-paid, or
  // ninety days late. Derived from the *edited* figures for the same reason the
  // balance is — a mid-edit disagreement between the two would be nonsense.
  const now = new Date()
  const pill = invoicePill({
    lifecycle: invoice.lifecycle,
    payment: derivePaymentStatus(
      { total: totalDue, applied: paid, lifecycle: invoice.lifecycle, dueDate: dueDate || undefined },
      now,
    ),
    aging: deriveAging({ dueDate: dueDate || undefined, balance, lifecycle: invoice.lifecycle }, now),
  })

  // Destructive actions live in the overflow; the trigger is pointless with
  // neither of them available (a voided invoice can be neither voided nor deleted).
  const canVoid = !isDraft && !isVoid
  const canDelete = isDraft
  // Moving Void/Delete into the overflow moved their in-flight labels in there
  // with them, so the toolbar read as completely idle for the whole request.
  // This is the always-visible half of that cue; the trigger is locked shut below.
  const destructiveBusyLabel = voiding ? 'Voiding…' : deleting ? 'Deleting…' : null

  // Shared by the empty state and the below-the-table controls so an empty
  // invoice offers exactly one of each button, not two.
  function addRowControls(className: string) {
    return (
      <div className={`flex flex-wrap gap-2 no-print ${className}`}>
        <Button size="sm" onClick={() => setPickerOpen(true)}>Add from catalog</Button>
        <Button size="sm" variant="outline" onClick={addRow}>Add blank line</Button>
      </div>
    )
  }

  const orgName = branding?.display_name
  const heading = invoice.number ?? '№ assigned when sent'

  return (
    // The rail cannot open at `lg`. Tailwind breakpoints are viewport-based but
    // `main` is not: at a 1024px viewport the md:w-56 sidebar leaves main 800px,
    // so p-6 → 752, minus a 320px rail and its gap → a 400px document column, of
    // which px-10 takes 80 — against a line-item table whose fixed tracks and gaps
    // need 448px before the description column gets a single pixel. Even a 260px
    // rail only reaches 388. 1200px is the first viewport where the two-column
    // layout leaves the description room (116px), so that is where it opens; below
    // it the document widens instead, which is what closed the dead gutter.
    <div className="mx-auto max-w-3xl p-6 lg:max-w-5xl xl:max-w-6xl min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1fr)_260px] min-[1200px]:gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-8">
      <div>
        {/* Action bar — primary action lives with the document, destructive actions are subordinate */}
        <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
          <Link href={`/${orgSlug}/leads/${leadId}`} className="text-sm text-muted-foreground hover:underline">
            ← Back to lead
          </Link>
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!isVoid && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit invoice</Button>
            )}
            {/* Drafts only. A sent invoice is locked server-side against every
                financial field this payload carries, so a Save here could only
                ever fail — its edits go out through Send update instead. */}
            {isDraft && (
              <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
            {!isVoid && (
              <Button size="sm" onClick={() => setSendOpen(true)} disabled={busy}>
                {showLink ? 'Send update' : 'Send invoice'}
              </Button>
            )}
            {/* Stays outside the overflow: a MenuItem closes the menu on click,
                which would swallow the "Copied!" confirmation entirely. */}
            {showLink && (
              <Button variant="ghost" size="sm" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy link'}</Button>
            )}
            {destructiveBusyLabel && (
              <span className="text-xs text-muted-foreground">{destructiveBusyLabel}</span>
            )}
            {(canVoid || canDelete) && (
              <Menu>
                <MenuTrigger
                  disabled={busy}
                  render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}
                >
                  <MoreHorizontal />
                </MenuTrigger>
                <MenuContent>
                  {canVoid && (
                    <MenuItem disabled={busy} onClick={() => setConfirmVoid(true)}>
                      {voiding ? 'Voiding…' : 'Void invoice'}
                    </MenuItem>
                  )}
                  {canDelete && (
                    <MenuItem disabled={busy} onClick={() => setConfirmDelete(true)}>
                      {deleting ? 'Deleting…' : 'Delete invoice'}
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>

        <div aria-live="polite" aria-atomic="true" className="mb-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {warning && <p className="text-sm text-destructive">{warning}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </div>

        {/* Document surface — same sheet the customer sees at /invoices/[token] */}
        <div className="invoice-document rounded-lg bg-card px-10 py-12 shadow-sm max-md:px-5 max-md:py-8">
          <header className="flex items-start justify-between gap-6 border-b pb-8 max-md:flex-col max-md:gap-3">
            <div>
              {branding?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo_url} alt="" className="mb-3 h-12 object-contain" />
              )}
              {orgName && <p className="text-sm font-semibold">{orgName}</p>}
              {branding?.address && (
                <p className="text-sm whitespace-pre-line text-muted-foreground">{branding.address}</p>
              )}
            </div>
            <div className="max-md:text-left md:text-right">
              {/* Deliberately quieter than the balance — the document title is
                  orientation, the balance is the answer. */}
              <h1 className="text-xl font-semibold tracking-tight">Invoice</h1>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">{heading}</p>
              <div className="mt-2 flex items-center gap-2 md:justify-end">
                <Label htmlFor="invDue" className="text-xs text-muted-foreground">Due</Label>
                <Input
                  id="invDue"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  readOnly={locked}
                  className="h-8 w-40"
                />
              </div>
              {invoice.sent_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent {new Date(invoice.sent_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </header>

          {customerName && (
            <div className="border-b py-6">
              <p className="font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Bill to</p>
              <p className="mt-1.5 text-sm font-semibold">{customerName}</p>
              {customerEmail && <p className="mt-0.5 text-sm text-muted-foreground">{customerEmail}</p>}
            </div>
          )}

          <div className="mt-6">
            <Label htmlFor="invTitle" className="text-xs text-muted-foreground">Title</Label>
            <Input
              id="invTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Invoice title"
              readOnly={locked}
              className="mt-1"
            />
          </div>

          {/* Line items — a table at md+, stacked blocks below it */}
          <div className="mt-6">
            {lineItems.length === 0 ? (
              // The CTA rides inside the empty state rather than sitting in the
              // block below it: a locked invoice used to be told to "add one
              // below" while the controls it pointed at were not rendered.
              <EmptyState
                icon={<Receipt className="size-4" />}
                title="No line items yet"
                description={
                  locked
                    ? 'This invoice carries no charges.'
                    : 'Pull a priced item from the catalog, or type a line by hand.'
                }
                action={locked ? undefined : addRowControls('justify-center')}
              />
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1fr)_4rem_7rem_7rem_5rem_2.5rem] gap-2 border-b pb-2 text-xs text-muted-foreground md:grid">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit price</span>
                  <span className="text-right">Subtotal</span>
                  <span className="text-center">Taxable</span>
                  <span />
                </div>
                {lineItems.map((item, i) => (
                  <div
                    key={i}
                    data-testid="line-item-row"
                    className="grid items-center gap-2 border-b py-2 max-md:grid-cols-2 max-md:py-3 md:grid-cols-[minmax(0,1fr)_4rem_7rem_7rem_5rem_2.5rem]"
                  >
                    {/* Labels are visible on mobile and collapse to sr-only at md+,
                        where the table header carries them instead. */}
                    <div className="space-y-1 max-md:col-span-2">
                      <Label htmlFor={`line-desc-${i}`} className="text-xs text-muted-foreground md:sr-only">
                        Description
                      </Label>
                      <Input
                        id={`line-desc-${i}`}
                        value={item.description}
                        onChange={(e) => updateRow(i, { description: e.target.value })}
                        placeholder="Description"
                        readOnly={locked}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1 max-md:col-span-2">
                      <Label htmlFor={`line-qty-${i}`} className="text-xs text-muted-foreground md:sr-only">
                        Qty
                      </Label>
                      <Input
                        id={`line-qty-${i}`}
                        type="number"
                        value={String(item.quantity)}
                        onChange={(e) => updateRow(i, { quantity: toNumber(e.target.value) })}
                        readOnly={locked}
                        className="h-8 md:text-right"
                      />
                    </div>
                    <div className="space-y-1 max-md:col-span-2">
                      <Label htmlFor={`line-price-${i}`} className="text-xs text-muted-foreground md:sr-only">
                        Unit price
                      </Label>
                      <Input
                        id={`line-price-${i}`}
                        type="number"
                        value={String(item.unit_price)}
                        onChange={(e) => updateRow(i, { unit_price: toNumber(e.target.value) })}
                        readOnly={locked}
                        className="h-8 md:text-right"
                      />
                    </div>
                    {/* A real label, not a ::before — a generated string plus a margin
                        gives the browser no wrap opportunity, so "Subtotal$1250.00"
                        becomes one unbreakable token and overflows the cell. */}
                    <p className="flex items-baseline gap-1 text-sm tabular-nums md:justify-end">
                      <span className="text-xs text-muted-foreground md:sr-only">Subtotal</span>
                      <span>{money(lineItemSubtotal(item))}</span>
                    </p>
                    <div className="flex items-center gap-1.5 md:justify-center">
                      <input
                        id={`taxable-${i}`}
                        type="checkbox"
                        checked={item.taxable !== false}
                        onChange={(e) => updateRow(i, { taxable: e.target.checked })}
                        disabled={locked}
                      />
                      <Label htmlFor={`taxable-${i}`} className="text-xs md:sr-only">Taxable</Label>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => removeRow(i)}
                      disabled={busy || locked}
                      className="justify-self-end max-md:col-span-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </>
            )}

            {!locked && lineItems.length > 0 && addRowControls('mt-3')}
          </div>

          {/* Totals — supporting lines stay quiet so the balance can be seen */}
          <div className="mt-8 flex justify-end">
            <dl className="w-full max-w-sm space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums" data-testid="breakdown-subtotal">{money(subtotal)}</dd>
              </div>

              <div className={`items-center justify-between gap-2 ${showDiscountRow ? 'flex' : 'hidden'}`}>
                <dt className="flex flex-wrap items-center gap-1.5">
                  <Label htmlFor="discountType" className="text-muted-foreground">Discount</Label>
                  <select
                    id="discountType"
                    value={discount?.type ?? 'none'}
                    disabled={locked}
                    onChange={(e) => {
                      const t = e.target.value
                      // Spread the previous discount: switching percent↔fixed is a
                      // normal correction and must not wipe a reason already typed
                      // (an absent reason is deleted from Firestore on the next save).
                      setDiscount((prev) =>
                        t === 'none'
                          ? undefined
                          : { ...prev, type: t as 'percent' | 'fixed', value: prev?.value ?? 0 },
                      )
                    }}
                    className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <option value="none">None</option>
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <Label htmlFor="discountValue" className="sr-only">Value</Label>
                  <Input
                    id="discountValue"
                    type="number"
                    value={String(discount?.value ?? 0)}
                    disabled={locked || !discount}
                    onChange={(e) => setDiscount((prev) => (prev ? { ...prev, value: toNumber(e.target.value) } : prev))}
                    className="h-7 w-16 text-xs"
                  />
                  {discount && (
                    <>
                      <Label htmlFor="discountReason" className="sr-only">Reason</Label>
                      <Input
                        id="discountReason"
                        value={discount.reason ?? ''}
                        disabled={locked}
                        onChange={(e) => setDiscount((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                        placeholder="Reason (optional)"
                        className="h-7 w-36 text-xs"
                      />
                    </>
                  )}
                </dt>
                <dd className="tabular-nums text-muted-foreground" data-testid="breakdown-discount">
                  {discountAmt > 0 ? `−${money(discountAmt)}` : money(0)}
                </dd>
              </div>

              <div className={`items-center justify-between gap-2 ${showTaxRow ? 'flex' : 'hidden'}`}>
                <dt className="flex items-center gap-1.5">
                  <Label htmlFor="taxRate" className="text-muted-foreground">Tax rate (%)</Label>
                  <Input
                    id="taxRate"
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    readOnly={locked}
                    className="h-7 w-16 text-xs"
                  />
                </dt>
                <dd className="tabular-nums text-muted-foreground" data-testid="breakdown-tax">
                  {taxAmt > 0 ? `+${money(taxAmt)}` : money(0)}
                </dd>
              </div>

              {credits.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{c.description || 'Credit'}</dt>
                  <dd className="tabular-nums text-muted-foreground" data-testid={`breakdown-credit-${i}`}>−{money(c.amount)}</dd>
                </div>
              ))}

              <div className="flex items-center justify-between border-t pt-2">
                <dt className="font-medium">Total</dt>
                <dd className="font-medium tabular-nums" data-testid="breakdown-total">{money(totalDue)}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Amount paid</dt>
                <dd className="tabular-nums text-muted-foreground" data-testid="breakdown-paid">{money(paid)}</dd>
              </div>

              {/* The one figure this screen exists for. */}
              <div className="flex items-baseline justify-between border-t pt-3">
                <dt className="text-sm font-medium">Balance</dt>
                <dd
                  className="text-2xl font-semibold tabular-nums tracking-[-.02em]"
                  data-testid="breakdown-balance"
                >
                  {money(balance)}
                </dd>
              </div>
              <p
                data-testid="balance-note"
                className={`text-right text-xs ${note.destructive ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {note.text}
              </p>
            </dl>
          </div>

          <div className="mt-8 border-t pt-6">
            <Label htmlFor="invNotes" className="font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              Notes
            </Label>
            <textarea
              id="invNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the client"
              readOnly={locked}
              className="mt-1.5 flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Subordinate rail: payments and history. No cards, quieter type. */}
      <aside className="mt-8 no-print min-[1200px]:mt-0">
        <section>
          <h2 className="font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Payments</h2>

          {invoice.payments.length === 0 ? (
            <EmptyState
              className="px-0 py-4"
              icon={<Wallet className="size-4" />}
              title="No payments yet"
              description={
                isVoid
                  ? 'This invoice was voided, so nothing can be collected against it.'
                  : 'Log cash, card, or transfer as it lands so the balance stays true.'
              }
              action={
                isVoid ? undefined : (
                  <Button size="sm" variant="outline" onClick={() => payAmountRef.current?.focus()}>
                    Record the first payment
                  </Button>
                )
              }
            />
          ) : (
            <ul className="mt-2 space-y-1.5">
              {invoice.payments.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b pb-1.5 text-sm last:border-b-0">
                  <span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                    {p.method && <span className="ml-2 text-xs text-muted-foreground">{p.method}</span>}
                    {(p.tip_amount ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">+{money(p.tip_amount as number)} tip</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(p.recorded_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!isVoid && (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                <div className="w-24 space-y-1">
                  <Label htmlFor="payAmount" className="text-xs">Amount</Label>
                  <Input ref={payAmountRef} id="payAmount" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" className="h-8" />
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor="payMethod" className="text-xs">Method</Label>
                  <Input id="payMethod" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="cash / card" className="h-8" />
                </div>
                {tipsOn && (
                  <div className="w-24 space-y-1">
                    <Label htmlFor="payTip" className="text-xs">Tip</Label>
                    <Input id="payTip" type="number" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="0.00" className="h-8" />
                  </div>
                )}
                <div className="min-w-[8rem] flex-1 space-y-1">
                  <Label htmlFor="payNote" className="text-xs">Note</Label>
                  <Input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Optional note" className="h-8" />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleRecordPayment} disabled={busy}>
                {recording ? 'Recording…' : 'Record payment'}
              </Button>
            </div>
          )}
        </section>

        {versions.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              History
            </summary>
            <ul className="mt-2 space-y-1.5">
              {versions.map((v, i) => (
                <li key={i} data-testid="history-entry" className="text-xs text-muted-foreground">
                  Sent {new Date(v.sent_at).toLocaleDateString()} — {v.line_items.length} item
                  {v.line_items.length === 1 ? '' : 's'}, {money(invoiceAmountDue(v))}
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>

      <ConfirmDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title="Void this invoice?"
        description="This cannot be undone."
        confirmLabel="Void invoice"
        onConfirm={handleVoid}
        destructive
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this invoice?"
        description="This cannot be undone."
        confirmLabel="Delete invoice"
        onConfirm={handleDelete}
        destructive
      />
      <InvoiceCatalogPicker orgId={orgId} open={pickerOpen} onOpenChange={setPickerOpen} onPick={handlePick} />
      <SendInvoiceDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        defaultTo={customerEmail ?? ''}
        isUpdate={showLink}
        onSend={handleSend}
      />
    </div>
  )
}
