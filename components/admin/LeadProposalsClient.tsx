'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill } from '@/components/ui/status-pill'
import { money, PROPOSAL_TONE } from '@/lib/pipeline-presentation'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

interface LeadProposalsClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  proposals: Proposal[]
}

/** Rows shown before the operator asks for the rest. */
const PREVIEW = 3

/**
 * "Where does the offer stand, and can I get the link out?"
 *
 * The deciding value per row is the price, so it is the right-hand figure in
 * money tone; status carries its own per-state tone rather than the one gray
 * badge every status used to share.
 *
 * The per-row "Copy client link" button is gone, not lost: the builder this row
 * opens already owns that control (ProposalBuilderClient.tsx:145). On the row it
 * was a peer-weight button competing with the row itself for the click, on every
 * row, for a link that only means anything once the proposal is sent.
 */

/**
 * The "so what" under a row. Deliberately not the status label — the pill
 * already says that — but the thing that decides whether to chase: a sent
 * proposal the client has never opened is a different problem from one they read
 * and went quiet on.
 */
function proposalNote(p: Proposal, ranged: boolean): string | undefined {
  if (p.status === 'sent') return p.first_opened_at ? 'opened by client' : 'not opened yet'
  if (ranged) return 'range across packages'
  return undefined
}
export function LeadProposalsClient({ orgSlug, leadId, proposals }: LeadProposalsClientProps) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(false)

  const rows: RelatedRow[] = proposals.map((p) => {
    const { min, max } = proposalDisplayRange(p)
    return {
      id: p.id,
      title: p.title || 'Untitled proposal',
      subtitle: proposalNote(p, min !== max),
      badge: <StatusPill tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>,
      amount: min === max ? money(min) : `${money(min)}–${money(max)}`,
      amountTone: 'money',
      href: `/${orgSlug}/leads/${leadId}/proposals/${p.id}`,
    }
  })

  const visible = showAll ? rows : rows.slice(0, PREVIEW)
  const newProposalHref = `/${orgSlug}/leads/${leadId}/proposals/new`

  function goToNew() {
    router.push(newProposalHref)
  }

  return (
    <RelatedRecordCard
      title="Proposals"
      count={rows.length}
      rows={visible}
      // The kit's own overflow line ("View all N →", related-record-card.tsx:53)
      // is a non-interactive <p> styled as a link, and it renders the moment
      // rows.length exceeds previewLimit. Pinning previewLimit to what we
      // actually pass keeps it from ever firing; the real control is in `footer`.
      previewLimit={visible.length || 1}
      newLabel="+ New"
      onNew={goToNew}
      emptyTitle="No proposals yet"
      emptyCtaLabel="Draft a proposal"
      onEmptyCta={goToNew}
      footer={
        rows.length > PREVIEW ? (
          <div className="border-t border-border px-3 py-1.5 text-center">
            <Button variant="link" size="xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </Button>
          </div>
        ) : undefined
      }
      // NOT hidden below md when empty. The R8 "suppress supplementary context
      // on a phone" idiom applies to context — a card whose EmptyState CTA is
      // the ONLY route to /leads/[leadId]/proposals/new on this screen is the
      // affordance, and hiding it leaves a brand-new opportunity (the most
      // common state, and the one where drafting a proposal is the whole point)
      // with no way to start one on a phone.
    />
  )
}
