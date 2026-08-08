import type { Proposal } from '@/lib/types'

const HOUR_MS = 3_600_000

export function isProposalOpened(p: Pick<Proposal, 'first_opened_at' | 'events'>): boolean {
  return !!p.first_opened_at || (p.events ?? []).some((e) => e.kind === 'viewed')
}

/** Fields to write for a portal view at nowIso; {} when inside the 1h throttle. */
export function openStampPatch(
  p: Pick<Proposal, 'first_opened_at' | 'last_opened_at'>,
  nowIso: string
): { first_opened_at?: string; last_opened_at?: string } {
  if (!p.first_opened_at) return { first_opened_at: nowIso, last_opened_at: nowIso }
  const last = p.last_opened_at ? new Date(p.last_opened_at).getTime() : 0
  if (new Date(nowIso).getTime() - last >= HOUR_MS) return { last_opened_at: nowIso }
  return {}
}
