'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  updateInvoice, issueInvoice, approveInvoice, voidInvoice, replaceInvoice, deleteInvoice, recordPayment,
} from '@/actions/invoices'
import { lineItemSubtotal, linesSubtotal, amountPaid, invoiceBalance } from '@/lib/invoices'
import { INVOICE_LIFECYCLE_LABELS, resolveTipsEnabled } from '@/lib/invoice-status'
import { LOCKED_LIFECYCLES } from '@/lib/invoice-lock'
import type { NormalizedInvoice, InvoiceLineItem } from '@/lib/types'

interface InvoiceEditorClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoice: NormalizedInvoice
  orgTipsEnabled?: boolean
  customerName?: string
}

const money = (n: number) => `$${n.toFixed(2)}`

// Parse a numeric text field: empty → 0, NaN guarded to 0.
function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

// A row is "fully blank" when it has no description and no positive numbers.
function isBlankRow(item: InvoiceLineItem): boolean {
  return item.description.trim() === '' && !(item.quantity > 0) && !(item.unit_price > 0)
}

export function InvoiceEditorClient({ orgId, orgSlug, leadId, invoice, orgTipsEnabled, customerName }: InvoiceEditorClientProps) {
  const router = useRouter()

  const [number, setNumber] = useState(invoice.number ?? '')
  const [title, setTitle] = useState(invoice.title ?? '')
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(invoice.line_items ?? [])

  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payNote, setPayNote] = useState('')
  const [tipAmount, setTipAmount] = useState('')

  const locked = LOCKED_LIFECYCLES.includes(invoice.lifecycle)
  const tipsOn = resolveTipsEnabled(invoice.tips_enabled, orgTipsEnabled)
  const showLink = invoice.lifecycle !== 'draft'

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

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const cleaned = lineItems.filter((item) => !isBlankRow(item))
      await updateInvoice(orgId, invoice.id, {
        number: number.trim() || undefined,
        title: title.trim() || undefined,
        due_date: dueDate || undefined,
        notes: notes.trim() || undefined,
        line_items: cleaned,
      })
      setLineItems(cleaned)
      setNotice('Saved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleApprove() {
    setApproving(true); setError(null); setNotice(null)
    try {
      await approveInvoice(orgId, invoice.id)
      setNotice('Invoice approved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally { setApproving(false) }
  }

  async function handleIssue() {
    setIssuing(true); setError(null); setNotice(null)
    try {
      await issueInvoice(orgId, invoice.id)
      setNotice('Invoice issued.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to issue')
    } finally { setIssuing(false) }
  }

  async function handleVoid() {
    if (!confirm('Void this invoice? This cannot be undone.')) return
    setVoiding(true); setError(null); setNotice(null)
    try {
      await voidInvoice(orgId, invoice.id)
      setNotice('Invoice voided.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to void')
    } finally { setVoiding(false) }
  }

  async function handleReplace() {
    setReplacing(true); setError(null); setNotice(null)
    try {
      const draft = await replaceInvoice(orgId, invoice.id)
      router.push(`/${orgSlug}/leads/${leadId}/invoices/${draft.id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to replace')
      setReplacing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    setDeleting(true); setError(null); setNotice(null)
    try {
      await deleteInvoice(orgId, invoice.id)
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
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

  const total = linesSubtotal(lineItems)
  const paid = amountPaid(invoice.payments)
  const balance = invoiceBalance(invoice)
  const busy = saving || approving || issuing || voiding || replacing || deleting || recording

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <Link href={`/${orgSlug}/leads/${leadId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to lead
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoice</h1>
        <Badge variant="secondary">{INVOICE_LIFECYCLE_LABELS[invoice.lifecycle]}</Badge>
      </div>

      {customerName && (
        <p className="text-sm text-muted-foreground">Bill to: <span className="font-medium text-foreground">{customerName}</span></p>
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invNumber">Invoice number</Label>
            <Input id="invNumber" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 1001" readOnly={locked} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invTitle">Title</Label>
            <Input id="invTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Invoice title" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invDue">Due date</Label>
            <Input id="invDue" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} readOnly={locked} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invNotes">Notes</Label>
            <textarea
              id="invNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the client"
              className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button size="sm" variant="outline" onClick={addRow} disabled={busy || locked}>Add line item</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineItems.length === 0 && (
            <p className="text-sm text-muted-foreground">No line items yet.</p>
          )}

          {lineItems.map((item, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px] space-y-1">
                <Label htmlFor={`desc-${i}`}>Description</Label>
                <Input
                  id={`desc-${i}`}
                  value={item.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  placeholder="Service or item"
                  readOnly={locked}
                />
                {invoice.source && (
                  <Badge variant="outline" className="text-[0.65rem]">{invoice.source.label ?? 'Linked source'}</Badge>
                )}
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`qty-${i}`}>Qty</Label>
                <Input
                  id={`qty-${i}`}
                  type="number"
                  value={String(item.quantity)}
                  onChange={(e) => updateRow(i, { quantity: toNumber(e.target.value) })}
                  readOnly={locked}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`price-${i}`}>Unit price</Label>
                <Input
                  id={`price-${i}`}
                  type="number"
                  value={String(item.unit_price)}
                  onChange={(e) => updateRow(i, { unit_price: toNumber(e.target.value) })}
                  readOnly={locked}
                />
              </div>
              <div className="w-24 space-y-1">
                <Label>Subtotal</Label>
                <p className="h-8 flex items-center text-sm font-medium">{money(lineItemSubtotal(item))}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeRow(i)} disabled={busy || locked}>Remove</Button>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-semibold">{money(total)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={busy || locked}>{saving ? 'Saving…' : 'Save'}</Button>
        {invoice.lifecycle === 'draft' && (
          <Button variant="outline" onClick={handleApprove} disabled={busy}>{approving ? 'Approving…' : 'Approve'}</Button>
        )}
        {(invoice.lifecycle === 'draft' || invoice.lifecycle === 'approved') && (
          <Button variant="outline" onClick={handleIssue} disabled={busy}>{issuing ? 'Issuing…' : 'Issue'}</Button>
        )}
        {invoice.lifecycle === 'issued' && (
          <>
            <Button variant="outline" onClick={handleVoid} disabled={busy}>{voiding ? 'Voiding…' : 'Void'}</Button>
            <Button variant="outline" onClick={handleReplace} disabled={busy}>{replacing ? 'Replacing…' : 'Replace'}</Button>
          </>
        )}
        {(invoice.lifecycle === 'draft' || invoice.lifecycle === 'approved') && (
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>{deleting ? 'Deleting…' : 'Delete'}</Button>
        )}
      </div>

      {showLink && (
        <Card>
          <CardHeader><CardTitle className="text-base">Client link</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Share this link with the client to view the invoice.</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareLink} className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {invoice.payments.length === 0 && (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          )}

          {invoice.payments.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{money(p.amount)}</span>
                {p.method && <span className="ml-2 text-xs text-muted-foreground">{p.method}</span>}
                {(p.tip_amount ?? 0) > 0 && <span className="ml-2 text-xs text-muted-foreground">+{money(p.tip_amount as number)} tip</span>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(p.recorded_at).toLocaleDateString()}</span>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm">Amount paid</span>
            <span className="text-sm font-medium">{money(paid)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Balance due</span>
            <span className="text-sm font-semibold">{money(balance)}</span>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28 space-y-1">
                <Label htmlFor="payAmount">Amount</Label>
                <Input id="payAmount" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor="payMethod">Method</Label>
                <Input id="payMethod" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="cash / check / card" />
              </div>
              {tipsOn && (
                <div className="w-28 space-y-1">
                  <Label htmlFor="payTip">Tip</Label>
                  <Input id="payTip" type="number" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="0.00" />
                </div>
              )}
              <div className="flex-1 min-w-[140px] space-y-1">
                <Label htmlFor="payNote">Note</Label>
                <Input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <Button size="sm" onClick={handleRecordPayment} disabled={busy}>
              {recording ? 'Recording…' : 'Record payment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
