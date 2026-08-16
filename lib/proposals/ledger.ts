import type { Proposal } from '@/lib/types'
import {
  PROPOSAL_STATUS_TONE,
  depositAmount,
  proposalDisplayRange,
  proposalExpiryInstant,
  type StatusTone,
} from '@/lib/proposals'
import { isProposalOpened } from '@/lib/proposal-opens'

export { PROPOSAL_STATUS_TONE }

/** A sent proposal inside this many days of its expiry wants a nudge. */
export const EXPIRING_SOON_DAYS = 7

const DAY_MS = 86_400_000

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** A proposal joined to its client's display name, as the index page loads it. */
export type ProposalLedgerInput = Proposal & { clientName: string }

/**
 * Why a sent proposal is in the needs-attention group. Deliberately built only
 * from fields the data model actually has: there is no `sent_at` on Proposal
 * and no `{kind:'sent'}` event is ever written, so "days since sent" is not
 * derivable — `updated_at` is bumped by every autosave and would lie.
 */
export type ProposalSignal = 'expired' | 'expiring' | 'unopened'

// Kept beside the signal union for the same reason PROPOSAL_STATUS_TONE sits
// beside the status labels: a new signal cannot be added without choosing a
// tone for it.
export const PROPOSAL_SIGNAL_TONE: Record<ProposalSignal, StatusTone> = {
  expired: 'alert',
  expiring: 'pending',
  unopened: 'pending',
}

export const PROPOSAL_SIGNAL_LABEL: Record<ProposalSignal, string> = {
  expired: 'Expired',
  expiring: 'Expiring soon',
  unopened: 'Not opened',
}

export type ProposalGroupKey =
  | 'needs_attention'
  | 'out_for_signature'
  | 'drafts'
  | 'accepted'
  | 'closed'

export interface ProposalLedgerRow {
  id: string
  leadId: string
  title: string
  clientName: string
  status: Proposal['status']
  /** Floor and ceiling of what the client could select; equal when fixed. */
  min: number
  max: number
  signal?: ProposalSignal
}

/**
 * Groups deliberately carry NO money roll-up: the KPI band owns money, the
 * groups own the work queue.
 *
 * A per-group total cannot agree with the band without lying somewhere. The
 * band's "Out for signature" spans every sent proposal, but signalled ones are
 * bucketed into `needs_attention`, so an identically-labelled group header
 * would print a smaller number directly beneath it. `accepted` has the mirror
 * problem — the tile sums locked floors while a group roll-up would sum
 * ceilings. And `closed` keeps its locked `selection.selected_total` (voiding
 * does not clear it), so summing it would show dead proposals as revenue.
 */
export interface ProposalLedgerGroup {
  key: ProposalGroupKey
  label: string
  tone: 'urgent' | 'normal'
  rows: ProposalLedgerRow[]
}

export interface ProposalLedgerTiles {
  outstandingValue: number
  outstandingCount: number
  needsAttention: number
  acceptedValue: number
  acceptedCount: number
  depositsDue: number
}

export interface ProposalLedger {
  groups: ProposalLedgerGroup[]
  tiles: ProposalLedgerTiles
  total: number
}

const GROUP_META: Record<ProposalGroupKey, { label: string; tone: 'urgent' | 'normal' }> = {
  needs_attention: { label: 'Needs attention', tone: 'urgent' },
  // NOT "Out for signature" — that is the KPI tile's label, and the tile counts
  // every sent proposal while this group holds only the ones with no signal.
  // Sharing the label would put "· 1" directly under a tile reading "2 proposals".
  out_for_signature: { label: 'Awaiting response', tone: 'normal' },
  drafts: { label: 'Drafts', tone: 'normal' },
  accepted: { label: 'Accepted', tone: 'normal' },
  closed: { label: 'Closed', tone: 'normal' },
}

const GROUP_ORDER: ProposalGroupKey[] = [
  'needs_attention',
  'out_for_signature',
  'drafts',
  'accepted',
  'closed',
]

// Expiry beats openness: a proposal that has run out of road is the more
// urgent fact about it, even if the client also never opened it.
function signalFor(p: ProposalLedgerInput, nowMs: number): ProposalSignal | undefined {
  if (p.expires_at) {
    const at = proposalExpiryInstant(p.expires_at)
    // proposalExpiryInstant returns Infinity for an unparseable date, which
    // deliberately means "never expires" — not "expired".
    if (Number.isFinite(at)) {
      if (at < nowMs) return 'expired'
      if (at - nowMs <= EXPIRING_SOON_DAYS * DAY_MS) return 'expiring'
    }
  }
  return isProposalOpened(p) ? undefined : 'unopened'
}

function groupFor(p: ProposalLedgerInput, signal: ProposalSignal | undefined): ProposalGroupKey {
  switch (p.status) {
    case 'sent':
      return signal ? 'needs_attention' : 'out_for_signature'
    case 'draft':
      return 'drafts'
    case 'accepted':
      return 'accepted'
    default:
      return 'closed'
  }
}

/**
 * The org-wide proposals ledger: decision-first groups plus the spend rollups
 * the index has always been able to compute and never showed.
 *
 * `now` is injected rather than read from the clock so expiry bucketing is
 * testable, mirroring lib/invoice-status.ts's deriveAging.
 */
export function buildProposalLedger(
  proposals: ProposalLedgerInput[],
  now: Date,
): ProposalLedger {
  const nowMs = now.getTime()
  const buckets = new Map<ProposalGroupKey, ProposalLedgerRow[]>()

  // Sorted once up front, so each bucket inherits newest-first order by
  // insertion instead of being re-sorted per group.
  const ordered = [...proposals].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )

  const tiles: ProposalLedgerTiles = {
    outstandingValue: 0,
    outstandingCount: 0,
    needsAttention: 0,
    acceptedValue: 0,
    acceptedCount: 0,
    depositsDue: 0,
  }

  for (const p of ordered) {
    // Only a sent proposal can want a nudge — a draft has not been sent and a
    // decided one is done, however stale their expiry date reads.
    const signal = p.status === 'sent' ? signalFor(p, nowMs) : undefined
    const key = groupFor(p, signal)
    const { min, max } = proposalDisplayRange(p)

    const row: ProposalLedgerRow = {
      id: p.id,
      leadId: p.lead_id,
      title: p.title || 'Untitled proposal',
      clientName: p.clientName,
      status: p.status,
      min,
      max,
      ...(signal ? { signal } : {}),
    }
    const rows = buckets.get(key)
    if (rows) rows.push(row)
    else buckets.set(key, [row])

    if (p.status === 'sent') {
      tiles.outstandingValue = round2(tiles.outstandingValue + max)
      tiles.outstandingCount += 1
      if (signal) tiles.needsAttention += 1
    }

    // Rejected and voided proposals keep a locked selection total, so money
    // tiles must gate on `accepted` rather than on the presence of a total.
    if (p.status === 'accepted') {
      tiles.acceptedValue = round2(tiles.acceptedValue + min)
      tiles.acceptedCount += 1
      if (p.deposit && p.payment_status !== 'deposit_paid') {
        tiles.depositsDue = round2(tiles.depositsDue + depositAmount(min, p.deposit))
      }
    }
  }

  const groups: ProposalLedgerGroup[] = GROUP_ORDER.flatMap((key) => {
    const rows = buckets.get(key)
    if (!rows || rows.length === 0) return []
    return [{
      key,
      label: GROUP_META[key].label,
      tone: GROUP_META[key].tone,
      rows,
    }]
  })

  return { groups, tiles, total: proposals.length }
}
