'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateProposal, sendProposal, deleteProposal } from '@/actions/proposals'
import {
  lineItemSubtotal,
  proposalTotal,
  proposalRange,
  depositAmount,
  PROPOSAL_STATUS_LABELS,
} from '@/lib/proposals'
import type {
  Proposal,
  ProposalLineItem,
  ProposalStatus,
  ProposalPackage,
  ProposalDiscount,
  ProposalDeposit,
} from '@/lib/types'

interface ProposalEditorClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  proposal: Proposal
}

const money = (n: number) => `$${n.toFixed(2)}`

// Parse a numeric text field: empty → 0, NaN guarded to 0.
function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

// A row is "fully blank" when it has no description and no positive numbers.
function isBlankRow(item: ProposalLineItem): boolean {
  return item.description.trim() === '' && !(item.quantity > 0) && !(item.unit_price > 0)
}

export function ProposalEditorClient({ orgId, orgSlug, leadId, proposal }: ProposalEditorClientProps) {
  const router = useRouter()

  const [title, setTitle] = useState(proposal.title ?? '')
  const [notes, setNotes] = useState(proposal.notes ?? '')
  const [lineItems, setLineItems] = useState<ProposalLineItem[]>(
    (proposal.line_items ?? []).map((i) => ({ ...i, id: i.id ?? crypto.randomUUID(), optional: i.optional ?? false })),
  )
  const [status, setStatus] = useState<ProposalStatus>(proposal.status)

  const [mode, setMode] = useState<'itemized' | 'packaged'>(proposal.packages?.length ? 'packaged' : 'itemized')
  const [packages, setPackages] = useState<ProposalPackage[]>(proposal.packages ?? [])
  const [discount, setDiscount] = useState<ProposalDiscount | undefined>(proposal.discount)
  const [taxRate, setTaxRate] = useState<string>(proposal.tax_rate != null ? String(proposal.tax_rate) : '')
  const [deposit, setDeposit] = useState<ProposalDeposit | undefined>(proposal.deposit)
  const [expiresAt, setExpiresAt] = useState(proposal.expires_at ?? '')
  const [depositGate, setDepositGate] = useState<'before_accept' | 'after_accept'>(
    proposal.deposit_gate ?? 'after_accept',
  )
  const [depositTerms, setDepositTerms] = useState(proposal.deposit_terms ?? '')

  // Locked whenever a signature is in progress or complete — `pending_signature`
  // means a before_accept deposit payment is in flight; editing/deleting during
  // that window would let the payment webhook later find nothing to promote.
  const locked = Boolean(proposal.signature) || Boolean(proposal.pending_signature)

  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(proposal.status !== 'draft')
  const [copied, setCopied] = useState(false)

  const shareLink =
    typeof window !== 'undefined' ? `${window.location.origin}/proposals/${proposal.token}` : `/proposals/${proposal.token}`

  function updateRow(index: number, patch: Partial<ProposalLineItem>) {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addRow() {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, optional: mode === 'packaged' },
    ])
  }

  function removeRow(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updatePackage(index: number, patch: Partial<ProposalPackage>) {
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPackage() {
    setPackages((prev) => [...prev, { id: crypto.randomUUID(), name: '', includes: [], price: 0 }])
  }

  function removePackage(index: number) {
    setPackages((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const cleaned = lineItems.filter((item) => !isBlankRow(item))
      const cleanedPackages = packages.filter((p) => p.name.trim() !== '' || p.price > 0)
      await updateProposal(orgId, proposal.id, {
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        line_items: cleaned,
        packages: mode === 'packaged' ? cleanedPackages : [],
        discount,
        tax_rate: taxRate.trim() === '' ? undefined : Number(taxRate),
        deposit,
        expires_at: expiresAt || undefined,
        deposit_gate: deposit ? depositGate : undefined,
        deposit_terms: deposit ? depositTerms.trim() || undefined : undefined,
      })
      setLineItems(cleaned)
      setPackages(cleanedPackages)
      setNotice('Saved.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleSend() {
    setSending(true); setError(null); setNotice(null)
    try {
      await sendProposal(orgId, proposal.id)
      setStatus('sent')
      setShowLink(true)
      setNotice('Sent to client.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally { setSending(false) }
  }

  async function handleDelete() {
    if (!confirm('Delete this proposal? This cannot be undone.')) return
    setDeleting(true); setError(null); setNotice(null)
    try {
      await deleteProposal(orgId, proposal.id)
      router.push(`/${orgSlug}/leads/${leadId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
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

  const total = proposalTotal(lineItems)
  const busy = saving || sending || deleting || locked

  const previewProposal = {
    packages: mode === 'packaged' ? packages : undefined,
    line_items: lineItems,
    discount,
    tax_rate: taxRate.trim() === '' ? undefined : Number(taxRate),
  }
  const range = proposalRange(previewProposal)
  const rangeLabel = range.min === range.max ? money(range.min) : `${money(range.min)}–${money(range.max)}`

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <Link href={`/${orgSlug}/leads/${leadId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to lead
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proposal</h1>
        <Badge variant="secondary">{PROPOSAL_STATUS_LABELS[status]}</Badge>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      {locked && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6">
            <p className="text-sm font-medium">
              This proposal is signed and locked. Create a new version to make changes.
            </p>
          </CardContent>
        </Card>
      )}

      {proposal.signature && (
        <Card>
          <CardHeader><CardTitle className="text-base">Signature &amp; audit</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Signer</p>
                <p>{proposal.signature.signer_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p>{proposal.signature.signer_email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Signed at (UTC)</p>
                <p>{new Date(proposal.signature.signed_at).toISOString().replace('T', ' ').replace('Z', ' UTC')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IP address</p>
                <p>{proposal.signature.ip}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">User agent</p>
                <p className="break-all">{proposal.signature.user_agent}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Document hash</p>
                <p className="font-mono text-xs break-all">{proposal.signature.document_hash}</p>
              </div>
            </div>

            {(proposal.payment_status || proposal.deposit_payment) && (
              <div className="border-t border-border pt-3 space-y-1">
                {proposal.payment_status && (
                  <p>
                    <span className="text-xs text-muted-foreground">Payment status: </span>
                    {proposal.payment_status}
                  </p>
                )}
                {proposal.deposit_payment && (
                  <p>
                    <span className="text-xs text-muted-foreground">Deposit paid: </span>
                    {money(proposal.deposit_payment.amount)}
                    {proposal.deposit_payment.paid_at &&
                      ` on ${new Date(proposal.deposit_payment.paid_at).toISOString().replace('T', ' ').replace('Z', ' UTC')}`}
                  </p>
                )}
              </div>
            )}

            {proposal.events && proposal.events.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs text-muted-foreground">Events</p>
                <ul className="space-y-1">
                  {proposal.events.map((ev, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium">{ev.kind}</span>
                      {' — '}
                      {new Date(ev.at).toISOString().replace('T', ' ').replace('Z', ' UTC')}
                      {ev.ip && ` — ${ev.ip}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="propTitle">Title</Label>
            <Input id="propTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposal title" disabled={locked} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="propNotes">Notes</Label>
            <textarea
              id="propNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the client"
              disabled={locked}
              className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'itemized' ? 'default' : 'outline'}
          onClick={() => setMode('itemized')}
          disabled={busy}
        >
          Itemized
        </Button>
        <Button
          size="sm"
          variant={mode === 'packaged' ? 'default' : 'outline'}
          onClick={() => setMode('packaged')}
          disabled={busy}
        >
          Packaged
        </Button>
      </div>

      {mode === 'packaged' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Packages</CardTitle>
            <Button size="sm" variant="outline" onClick={addPackage} disabled={busy || packages.length >= 3}>
              Add tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {packages.length === 0 && (
              <p className="text-sm text-muted-foreground">No tiers yet. Add up to 3.</p>
            )}

            {packages.map((pkg, i) => (
              <div key={pkg.id} className="space-y-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[160px] space-y-1">
                    <Label htmlFor={`pkg-name-${i}`}>Name</Label>
                    <Input
                      id={`pkg-name-${i}`}
                      value={pkg.name}
                      onChange={(e) => updatePackage(i, { name: e.target.value })}
                      placeholder="e.g. Good / Better / Best"
                      disabled={locked}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label htmlFor={`pkg-price-${i}`}>Price</Label>
                    <Input
                      id={`pkg-price-${i}`}
                      type="number"
                      value={String(pkg.price)}
                      onChange={(e) => updatePackage(i, { price: toNumber(e.target.value) })}
                      disabled={locked}
                    />
                  </div>
                  <div className="flex items-center gap-1 pb-2">
                    <input
                      id={`pkg-recommended-${i}`}
                      type="checkbox"
                      checked={pkg.recommended ?? false}
                      onChange={(e) => updatePackage(i, { recommended: e.target.checked })}
                      disabled={locked}
                    />
                    <Label htmlFor={`pkg-recommended-${i}`}>Recommended</Label>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removePackage(i)} disabled={busy}>Remove</Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`pkg-includes-${i}`}>Includes (one per line)</Label>
                  <textarea
                    id={`pkg-includes-${i}`}
                    value={pkg.includes.join('\n')}
                    onChange={(e) =>
                      updatePackage(i, {
                        includes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="One bullet per line"
                    disabled={locked}
                    className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button size="sm" variant="outline" onClick={addRow} disabled={busy}>Add line item</Button>
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
                  disabled={locked}
                />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`qty-${i}`}>Qty</Label>
                <Input
                  id={`qty-${i}`}
                  type="number"
                  value={String(item.quantity)}
                  onChange={(e) => updateRow(i, { quantity: toNumber(e.target.value) })}
                  disabled={locked}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`price-${i}`}>Unit price</Label>
                <Input
                  id={`price-${i}`}
                  type="number"
                  value={String(item.unit_price)}
                  onChange={(e) => updateRow(i, { unit_price: toNumber(e.target.value) })}
                  disabled={locked}
                />
              </div>
              <div className="w-24 space-y-1">
                <Label>Subtotal</Label>
                <p className="h-8 flex items-center text-sm font-medium">{money(lineItemSubtotal(item))}</p>
              </div>
              <div className="flex items-center gap-1 pb-2">
                <input
                  id={`optional-${i}`}
                  type="checkbox"
                  checked={item.optional ?? false}
                  onChange={(e) => updateRow(i, { optional: e.target.checked })}
                  disabled={locked}
                />
                <Label htmlFor={`optional-${i}`}>Optional</Label>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeRow(i)} disabled={busy}>Remove</Button>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-semibold">{money(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36 space-y-1">
              <Label htmlFor="discountType">Discount</Label>
              <select
                id="discountType"
                value={discount?.type ?? 'none'}
                onChange={(e) => {
                  const t = e.target.value
                  setDiscount(t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: discount?.value ?? 0 })
                }}
                disabled={locked}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="discountValue">Value</Label>
              <Input
                id="discountValue"
                type="number"
                value={String(discount?.value ?? 0)}
                disabled={locked || !discount}
                onChange={(e) => setDiscount((prev) => (prev ? { ...prev, value: toNumber(e.target.value) } : prev))}
              />
            </div>
          </div>

          <div className="w-28 space-y-1">
            <Label htmlFor="taxRate">Tax rate (%)</Label>
            <Input id="taxRate" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={locked} />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36 space-y-1">
              <Label htmlFor="depositType">Deposit</Label>
              <select
                id="depositType"
                value={deposit?.type ?? 'none'}
                onChange={(e) => {
                  const t = e.target.value
                  setDeposit(t === 'none' ? undefined : { type: t as 'percent' | 'fixed', value: deposit?.value ?? 0 })
                }}
                disabled={locked}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="depositValue">Value</Label>
              <Input
                id="depositValue"
                type="number"
                value={String(deposit?.value ?? 0)}
                disabled={locked || !deposit}
                onChange={(e) => setDeposit((prev) => (prev ? { ...prev, value: toNumber(e.target.value) } : prev))}
              />
            </div>
          </div>

          {deposit && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="w-64 space-y-1">
                <Label htmlFor="depositGate">Deposit gate</Label>
                <select
                  id="depositGate"
                  value={depositGate}
                  onChange={(e) => setDepositGate(e.target.value as 'before_accept' | 'after_accept')}
                  disabled={locked}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="after_accept">Request deposit after acceptance</option>
                  <option value="before_accept">Require deposit before accepting</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="depositTerms">Cancellation / refund policy (shown to the client at signing)</Label>
                <textarea
                  id="depositTerms"
                  value={depositTerms}
                  onChange={(e) => setDepositTerms(e.target.value)}
                  placeholder="e.g. Deposit is non-refundable within 30 days of the event date."
                  disabled={locked}
                  className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          <div className="w-44 space-y-1">
            <Label htmlFor="expiresAt">Expires</Label>
            <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} disabled={locked} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm font-semibold">Client sees: {rangeLabel}</p>
            {deposit && (
              <p className="text-xs text-muted-foreground">Deposit: {money(depositAmount(range.max, deposit))}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={busy}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button variant="outline" onClick={handleSend} disabled={busy}>{sending ? 'Sending…' : 'Send to client'}</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={busy}>{deleting ? 'Deleting…' : 'Delete'}</Button>
      </div>

      {showLink && (
        <Card>
          <CardHeader><CardTitle className="text-base">Client link</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Share this link with the client to accept or reject the proposal.</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareLink} className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
