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
import { lineItemSubtotal, proposalTotal, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { Proposal, ProposalLineItem, ProposalStatus } from '@/lib/types'

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
  const [lineItems, setLineItems] = useState<ProposalLineItem[]>(proposal.line_items ?? [])
  const [status, setStatus] = useState<ProposalStatus>(proposal.status)

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
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }])
  }

  function removeRow(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const cleaned = lineItems.filter((item) => !isBlankRow(item))
      await updateProposal(orgId, proposal.id, {
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        line_items: cleaned,
      })
      setLineItems(cleaned)
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
  const busy = saving || sending || deleting

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

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="propTitle">Title</Label>
            <Input id="propTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposal title" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="propNotes">Notes</Label>
            <textarea
              id="propNotes"
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
                />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`qty-${i}`}>Qty</Label>
                <Input
                  id={`qty-${i}`}
                  type="number"
                  value={String(item.quantity)}
                  onChange={(e) => updateRow(i, { quantity: toNumber(e.target.value) })}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`price-${i}`}>Unit price</Label>
                <Input
                  id={`price-${i}`}
                  type="number"
                  value={String(item.unit_price)}
                  onChange={(e) => updateRow(i, { unit_price: toNumber(e.target.value) })}
                />
              </div>
              <div className="w-24 space-y-1">
                <Label>Subtotal</Label>
                <p className="h-8 flex items-center text-sm font-medium">{money(lineItemSubtotal(item))}</p>
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
