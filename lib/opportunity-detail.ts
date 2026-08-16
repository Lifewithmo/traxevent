import { shortDate } from '@/lib/pipeline-presentation'
import type { Proposal, LeadStage } from '@/lib/types'
import type { OppHealth } from '@/lib/opportunity-health'

/** Up to two uppercase initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** ISO date (YYYY-MM-DD) `days` after the given YYYY-MM-DD base. */
export function addDays(baseYmd: string, days: number): string {
  const d = new Date(`${baseYmd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Local calendar date as YYYY-MM-DD (matches <input type="date"> values). */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whole calendar days between an ISO timestamp's date part and todayYmd. */
export function daysSince(iso: string, todayYmd: string): number {
  const a = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime()
  const b = new Date(`${todayYmd}T00:00:00.000Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function lastTouchIso(lead: { last_touch_at?: string; updated_at?: string; created_at: string }): string {
  return lead.last_touch_at ?? lead.updated_at ?? lead.created_at
}

export type DueStatus = 'overdue' | 'today' | 'upcoming'

export function dueStatus(dueYmd: string, today: string): DueStatus {
  if (dueYmd < today) return 'overdue'
  if (dueYmd === today) return 'today'
  return 'upcoming'
}

/** Coarse "n ago" label for activity/timeline. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export interface BannerContent {
  tone: 'active' | 'waiting' | 'attention' | 'closed'
  heading: string
  detail: string
}

export interface BannerInput {
  nextTitle?: string
  dueYmd?: string
  todayYmd: string
  waitingReason?: string
  waitingFollowUp?: string
  stageLabel: string
  lastTouchDays?: number
}

/**
 * ONE date format for the module. These strings land in NextActionBanner,
 * directly above the tasks card — which renders `shortDate`, as do the KPI
 * band, FactsGrid, DatesPanel, the pipeline list and the board. The banner was
 * the last surface still emitting a raw `YYYY-MM-DD`, so the opportunity page
 * read "Overdue · was due 2026-08-14" one card above "Aug 14, 2026".
 */
function dueLabel(dueYmd: string, today: string): string {
  const s = dueStatus(dueYmd, today)
  if (s === 'overdue') return `Overdue · was due ${shortDate(dueYmd)}`
  if (s === 'today') return 'Due today'
  return `Due ${shortDate(dueYmd)}`
}

export function bannerContent(health: OppHealth, o: BannerInput): BannerContent {
  switch (health) {
    case 'active':
      return {
        tone: 'active',
        heading: o.nextTitle ?? 'Next action',
        detail: o.dueYmd ? dueLabel(o.dueYmd, o.todayYmd) : 'Scheduled',
      }
    case 'waiting':
      return {
        tone: 'waiting',
        heading: 'Waiting',
        // Same `shortDate` the pipeline list's waiting sentence already uses for
        // this very field (lib/pipeline-view.ts:88).
        detail: [o.waitingReason, o.waitingFollowUp ? `follow up ${shortDate(o.waitingFollowUp)}` : null]
          .filter(Boolean)
          .join(' · ') || 'Waiting on a reply',
      }
    case 'needs_attention': {
      const touch = o.lastTouchDays != null
        ? ` Last touch ${o.lastTouchDays} day${o.lastTouchDays === 1 ? '' : 's'} ago.`
        : ''
      return {
        tone: 'attention',
        heading: 'No next action',
        detail: `This opportunity has nothing scheduled — add a next step so it never rots.${touch}`,
      }
    }
    case 'closed':
    default:
      return { tone: 'closed', heading: 'Closed', detail: o.stageLabel }
  }
}

/**
 * WHICH thing is standing between this opportunity and a scheduled job.
 *
 * `message` alone cannot say: both non-ready cases return `ready: false`, so a
 * consumer wanting to offer the forward move had to match on the prose. The
 * convert card renders a different live CTA per blocker — "Mark won" when the
 * only thing missing is the win, a route to the proposals when the signature
 * is — so the discriminant is part of the contract, not a display detail.
 */
export type ConvertBlocker =
  | 'none'                // already won: convertible now
  | 'unsigned_proposal'   // no accepted (= signed) proposal yet
  | 'not_won'             // signed, but the deal has not been marked won

/** Why the convert card is blocked (or what would unblock it) short of closed_won. */
export function convertBlockReason(i: {
  stage: LeadStage
  proposals: Pick<Proposal, 'status'>[]
  guestCount?: number
}): { ready: boolean; blocker: ConvertBlocker; message: string } {
  if (i.stage === 'closed_won') return { ready: true, blocker: 'none', message: '' }
  // Signing IS accepting (signProposal writes status + signature together),
  // so an accepted proposal is a signed document — no separate contract gate.
  if (!i.proposals.some((p) => p.status === 'accepted')) {
    const guests = i.guestCount != null ? ` and ${i.guestCount} guests` : ''
    return {
      ready: false,
      blocker: 'unsigned_proposal',
      message: `Blocked: no signed proposal yet. Signed acceptance carries the accepted package${guests} into Events.`,
    }
  }
  return { ready: false, blocker: 'not_won', message: 'Ready — mark the deal won to convert.' }
}
