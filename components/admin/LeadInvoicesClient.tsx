'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill } from '@/components/ui/status-pill'
import { createInvoice, generateFromProposal } from '@/actions/invoices'
import { invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { INVOICE_LIFECYCLE_LABELS, INVOICE_TYPE_LABELS } from '@/lib/invoice-status'
import { todayYmd } from '@/lib/opportunity-detail'
import { money, shortDate, INVOICE_LIFECYCLE_TONE, type Tone } from '@/lib/pipeline-presentation'
import type { NormalizedInvoice, InvoiceType } from '@/lib/types'

interface LeadInvoicesClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoices: NormalizedInvoice[]
  acceptedProposals: { id: string; title?: string }[]
}

const INVOICE_TYPES: InvoiceType[] = ['deposit', 'progress', 'final', 'quick']

/** Rows shown before the operator asks for the rest. */
const PREVIEW = 3

/**
 * Liveness predicate, character-for-character the one in
 * lib/opportunity-rollup.ts:72 — not void AND still carrying a positive balance.
 * The footer total and the KPI band's Open balance tile read the same invoices,
 * so they must never disagree; the `> 0` half is what stops an overpaid invoice
 * (a real state — invoiceBalance goes negative) from silently crediting what the
 * customer owes on the others.
 */
function isLive(inv: NormalizedInvoice): boolean {
  return inv.lifecycle !== 'void' && invoiceBalance(inv) > 0
}

/**
 * Past due on the SAME terms as the rollup: a live invoice whose due date has
 * passed, with NO lifecycle test (lib/opportunity-rollup.ts:81-86). A draft that
 * ran past its due date counts there, so it has to count here — otherwise the
 * KPI band shows an overdue figure this pane says nothing about, which is the
 * exact disagreement the footer exists to prevent.
 */
function isOverdue(inv: NormalizedInvoice, today: string): boolean {
  return inv.due_date != null && inv.due_date < today
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The pill an invoice earns.
 *
 * Lifecycle alone cannot say this: `InvoiceLifecycle` is draft|sent|void and has
 * no 'paid' member (lib/types.ts:658) — settled-ness is a property of the
 * BALANCE. So lifecycle supplies the tone for the states it owns, and paid /
 * overdue are derived on top, which is also what makes the four states an
 * operator actually distinguishes render in four different tones instead of two.
 */
function invoicePill(inv: NormalizedInvoice, today: string): { tone: Tone; label: string } {
  if (inv.lifecycle === 'void') {
    return { tone: INVOICE_LIFECYCLE_TONE.void, label: INVOICE_LIFECYCLE_LABELS.void }
  }
  // `invoiceAmountDue > 0` guards the empty draft: a brand-new invoice with no
  // line items also has a zero balance, and calling that "Paid" would be a lie.
  if (invoiceBalance(inv) <= 0 && invoiceAmountDue(inv) > 0) {
    return { tone: 'confirmed', label: 'Paid' }
  }
  if (inv.lifecycle === 'sent' && inv.due_date != null && inv.due_date < today) {
    return { tone: 'alert', label: 'Overdue' }
  }
  return { tone: INVOICE_LIFECYCLE_TONE[inv.lifecycle], label: INVOICE_LIFECYCLE_LABELS[inv.lifecycle] }
}

/**
 * "What is still owed on this job, and what do I bill next?"
 *
 * The deciding number is the summed open balance, so it is the card's footer
 * figure — the one value the operator scans to. Per-row amounts are that
 * invoice's share of it. Past due is a SECOND figure beneath it, never a tone on
 * the first: "$10,000" with "$500 past due" under it is true; "$10,000 past due"
 * is not, and that is what toning the whole balance off a boolean produced.
 *
 * Where the generate-from-proposal control lives is state-dependent on purpose:
 * with no invoices yet it IS the empty state's single CTA (billing the accepted
 * proposal is the forward move), and once invoices exist it drops into the
 * footer under the balance. RelatedRecordCard renders `footer` only in the
 * non-empty branch (related-record-card.tsx:48-56), so the two placements are
 * exactly complementary and the control is never unreachable — and the panel
 * each one opens renders next to that trigger, never above the card where it
 * would shove the just-clicked button off the operator's focus point.
 */
export function LeadInvoicesClient({ orgId, orgSlug, leadId, invoices, acceptedProposals }: LeadInvoicesClientProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGen, setShowGen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [genProposalId, setGenProposalId] = useState(acceptedProposals[0]?.id ?? '')
  const [genType, setGenType] = useState<InvoiceType>('deposit')
  const [generating, setGenerating] = useState(false)

  const today = todayYmd()
  const canGenerate = acceptedProposals.length > 0

  async function handleCreate() {
    // RelatedRecordCard's header action has no disabled state to drive, so the
    // re-entrancy guard lives here rather than shipping a control that looks
    // live mid-create.
    if (creating) return
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

  const rows: RelatedRow[] = invoices.map((inv) => {
    const pill = invoicePill(inv, today)
    const balance = invoiceBalance(inv)
    return {
      id: inv.id,
      title: `${inv.number ? `#${inv.number} ` : ''}${inv.title || 'Invoice'}`,
      subtitle: inv.due_date ? `due ${shortDate(inv.due_date)}` : `${money(invoiceAmountDue(inv))} invoiced`,
      badge: <StatusPill tone={pill.tone}>{pill.label}</StatusPill>,
      amount: money(balance),
      amountTone: pill.tone === 'alert' ? 'alert' : 'money',
      href: `/${orgSlug}/leads/${leadId}/invoices/${inv.id}`,
    }
  })

  /**
   * The generate-from-proposal form body. Rendered in exactly one of two
   * places, never both: in the card footer under its footer trigger, or below
   * the card when the empty state's CTA is the trigger. The two branches are
   * mutually exclusive on `rows.length`, so the duplicated field ids are never
   * in the document at the same time.
   */
  const genFields = (
    <>
      {acceptedProposals.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="genProposal">Proposal</Label>
          <select
            id="genProposal"
            value={genProposalId}
            onChange={(e) => setGenProposalId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            {acceptedProposals.map((p) => (
              <option key={p.id} value={p.id}>{p.title || 'Proposal'}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="genType">Type</Label>
        <select
          id="genType"
          value={genType}
          onChange={(e) => setGenType(e.target.value as InvoiceType)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
    </>
  )

  const visible = showAll ? rows : rows.slice(0, PREVIEW)
  const live = invoices.filter(isLive)
  const openBalance = round2(live.reduce((s, v) => s + invoiceBalance(v), 0))
  // A SUM, never a boolean. Toning the whole open balance off `some(overdue)`
  // made a lead with $10,000 open of which $500 is late render "$10,000 past
  // due" — a false statement about money on the pane the operator bills from.
  const overdueBalance = round2(
    live.filter((v) => isOverdue(v, today)).reduce((s, v) => s + invoiceBalance(v), 0)
  )

  const footer = (
    <div className="border-t border-border">
      <div className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
        <span className="font-medium text-muted-foreground">Open balance</span>
        <span className="text-right">
          <span data-testid="open-balance" className="block font-semibold tabular-nums text-[var(--money-green)]">
            {money(openBalance)}
          </span>
          {overdueBalance > 0 && (
            <span data-testid="overdue-balance" className="block font-semibold tabular-nums text-destructive">
              {money(overdueBalance)} past due
            </span>
          )}
        </span>
      </div>
      {(canGenerate || rows.length > PREVIEW) && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          {canGenerate ? (
            <Button variant="link" size="xs" onClick={() => setShowGen((v) => !v)}>
              Generate from proposal
            </Button>
          ) : <span />}
          {rows.length > PREVIEW && (
            <Button variant="link" size="xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </Button>
          )}
        </div>
      )}
      {/* Adjacent to the trigger directly above it. Rendered ABOVE the card this
          panel pushed the card — and the just-clicked button — down the page,
          scrolling the revealed Type select away from where the operator was
          looking. jsdom has no viewport, so nothing caught it. */}
      {showGen && (
        <div data-testid="generate-panel" className="space-y-3 border-t border-border px-3 py-3">
          {genFields}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <RelatedRecordCard
        title="Invoices"
        count={rows.length}
        rows={visible}
        // Pinned to what we actually pass so the kit's non-interactive
        // "View all N →" line (related-record-card.tsx:53) can never fire; the
        // working overflow control lives in `footer`.
        previewLimit={visible.length || 1}
        newLabel={creating ? 'Creating…' : '+ New'}
        onNew={handleCreate}
        emptyTitle="No invoices yet"
        emptyCtaLabel={canGenerate ? 'Generate from proposal' : 'Create the first invoice'}
        onEmptyCta={canGenerate ? () => setShowGen(true) : handleCreate}
        footer={footer}
      />

      {/* The empty branch drops `footer` entirely (related-record-card.tsx:48),
          so the panel its EmptyState CTA opens lives here — below the card,
          which is still adjacent to the CTA and never displaces it. */}
      {showGen && rows.length === 0 && (
        <div data-testid="generate-panel" className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-xs">
          {genFields}
        </div>
      )}
    </div>
  )
}
