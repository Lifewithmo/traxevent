'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill } from '@/components/ui/status-pill'
import { createInvoice, generateFromProposal } from '@/actions/invoices'
import { amountPaid, invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { derivePaymentStatus, deriveAging, INVOICE_TYPE_LABELS } from '@/lib/invoice-status'
import { invoicePill, money2 } from '@/lib/invoice-presentation'
import type { NormalizedInvoice, InvoiceType } from '@/lib/types'

interface LeadInvoicesClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoices: NormalizedInvoice[]
  acceptedProposals: { id: string; title?: string }[]
}

const INVOICE_TYPES: InvoiceType[] = ['deposit', 'progress', 'final', 'quick']

const round2 = (n: number) => Math.round(n * 100) / 100

export function LeadInvoicesClient({ orgId, orgSlug, leadId, invoices, acceptedProposals }: LeadInvoicesClientProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGen, setShowGen] = useState(false)
  const [genProposalId, setGenProposalId] = useState(acceptedProposals[0]?.id ?? '')
  const [genType, setGenType] = useState<InvoiceType>('deposit')
  const [generating, setGenerating] = useState(false)

  async function handleCreate() {
    setCreating(true); setError(null)
    try {
      const created = await createInvoice(orgId, leadId, {})
      router.push(`/${orgSlug}/leads/${leadId}/invoices/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice')
      setCreating(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true); setError(null)
    try {
      const created = await generateFromProposal(orgId, leadId, genProposalId, { type: genType })
      router.push(`/${orgSlug}/leads/${leadId}/invoices/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice')
      setGenerating(false)
    }
  }

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invoices/${token}`)
      setCopied(token)
    } catch {
      setError('Could not copy link.')
    }
  }

  // One pass over the invoices produces both the rows and the footer rollup, so
  // the "any overdue" tint on the open balance is derived from the very same
  // pill the operator reads off each row.
  const now = new Date()
  const priced = invoices.map((inv) => {
    const balance = invoiceBalance(inv)
    const payment = derivePaymentStatus(
      { total: invoiceAmountDue(inv), applied: amountPaid(inv.payments), lifecycle: inv.lifecycle, dueDate: inv.due_date },
      now,
    )
    const aging = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle }, now)
    return { inv, balance, pill: invoicePill({ lifecycle: inv.lifecycle, payment, aging }) }
  })

  // `sent` is the only lifecycle where money is actually owed: a draft has not
  // been asked for yet and a void was withdrawn. And an overpaid invoice carries
  // a NEGATIVE balance, which must not net against what other invoices owe.
  // Both halves mirror `isCollectable` in lib/money-overview.ts and the
  // `lifecycle === 'sent'` + `balance > 0` pair in `customerAR` (lib/crm/ar-rollup.ts),
  // which feeds the identical footer on the client rail.
  const openBalance = round2(
    priced.reduce((sum, p) => (p.inv.lifecycle === 'sent' && p.balance > 0 ? sum + p.balance : sum), 0),
  )
  const anyOverdue = priced.some((p) => p.pill.tone === 'alert')

  const rows: RelatedRow[] = priced.map(({ inv, balance, pill }) => ({
    id: inv.id,
    title: inv.number ? `Invoice ${inv.number}` : inv.title || 'Invoice',
    subtitle: inv.due_date ? `Due ${inv.due_date}` : undefined,
    badge: <StatusPill tone={pill.tone}>{pill.label}</StatusPill>,
    // A draft has never been handed to the client, so there is no link to share
    // yet — same guard the pre-kit row carried. The card renders `actions`
    // outside the row's anchor, so this button is a sibling of the link rather
    // than an interactive descendant of it — no click interception needed.
    actions:
      inv.lifecycle !== 'draft' ? (
        <Button variant="ghost" size="xs" onClick={() => void handleCopy(inv.token)}>
          {copied === inv.token ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {/* Visually collapses to the icon on a phone, but stays in the
              accessibility tree so the button keeps its name at every width. */}
          <span className="max-sm:sr-only">{copied === inv.token ? 'Copied!' : 'Copy client link'}</span>
        </Button>
      ) : undefined,
    amount: money2(balance),
    amountTone: pill.tone === 'alert' ? 'alert' : pill.tone === 'confirmed' ? 'money' : 'default',
    href: `/${orgSlug}/leads/${leadId}/invoices/${inv.id}`,
  }))

  const footer = (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
      <span className="font-medium text-muted-foreground">Open balance</span>
      <span className={cn('font-semibold tabular-nums', anyOverdue ? 'text-destructive' : 'text-foreground')}>
        {money2(openBalance)}
      </span>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Errors and the secondary creation path share one line: the live region
          stays mounted (so it can announce) without costing an empty band. */}
      <div className="flex items-start justify-between gap-3">
        <div aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        {acceptedProposals.length > 0 && (
          <Button variant="outline" size="sm" aria-expanded={showGen} onClick={() => setShowGen((v) => !v)}>
            Generate from proposal
          </Button>
        )}
      </div>

      {showGen && acceptedProposals.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs sm:flex-row sm:items-end">
          {acceptedProposals.length > 1 && (
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="genProposal">Proposal</Label>
              <select
                id="genProposal"
                value={genProposalId}
                onChange={(e) => setGenProposalId(e.target.value)}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {acceptedProposals.map((p) => (
                  <option key={p.id} value={p.id}>{p.title || 'Proposal'}</option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="genType">Type</Label>
            <select
              id="genType"
              value={genType}
              onChange={(e) => setGenType(e.target.value as InvoiceType)}
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {INVOICE_TYPES.map((t) => (
                <option key={t} value={t}>{INVOICE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
            <Button variant="ghost" onClick={() => setShowGen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <RelatedRecordCard
        title="Invoices"
        count={invoices.length}
        rows={rows}
        // A job carries a handful of invoices, not a feed — show them all rather
        // than hiding the rest behind the card's inert "View all" line.
        previewLimit={Math.max(rows.length, 1)}
        newLabel={creating ? 'Creating…' : '+ New invoice'}
        // Exactly one create affordance per state: the empty state owns the CTA
        // when there is nothing to list, the header owns it once rows exist.
        onNew={rows.length > 0 ? handleCreate : undefined}
        emptyTitle="No invoices yet"
        emptyCtaLabel={creating ? 'Creating…' : 'Create invoice'}
        onEmptyCta={handleCreate}
        footer={footer}
      />
    </div>
  )
}
