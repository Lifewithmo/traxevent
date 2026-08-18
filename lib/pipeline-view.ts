import type { Lead, Task, Proposal } from '@/lib/types'
import { computeHealth, nextAction, type OppHealth } from '@/lib/opportunity-health'
import { daysSince, dueStatus, lastTouchIso } from '@/lib/opportunity-detail'
import { isProposalOpened } from '@/lib/proposal-opens'
import { CLOSED_STAGES, OPEN_STAGES } from '@/lib/leads'
import { wonValueInMonth, addDaysYmd } from '@/lib/pipeline-stats'
import { DUE_TONE, shortDate, type Tone } from '@/lib/pipeline-presentation'
import type { LeadStage } from '@/lib/types'

/**
 * Prep an event needs before its date, in days. The pipeline ranks by the
 * "book-by" deadline (`event_date − prep_lead_days`), not touch-staleness, so an
 * unbooked wedding 8 days out outranks a stale inquiry 9 months out. A single
 * tunable per org (`org.prep_lead_days`); this is the fallback when unset.
 */
export const DEFAULT_PREP_LEAD_DAYS = 14

// Stages that occupy a calendar date: any two of these on the same day are a
// booking conflict for the solo-operator anchor (capacity = 1 in v1). Open
// deals AND the win — a booked job blocks a still-open opp on its date.
const BOOKABLE_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

/** Signed whole calendar days from `fromYmd` to `toYmd`; negative when `toYmd` is in the past. */
function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T00:00:00.000Z`).getTime()
  const b = new Date(`${toYmd}T00:00:00.000Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * Event dates carried by ≥2 leads that occupy a calendar slot (open ∪ won).
 *
 * Pure so it can be unit-tested: a `closed_won` and an open opp on the same
 * Saturday must both surface as a conflict, and that rule can't hide inside the
 * page component. No new query — the caller already holds every lead in memory.
 */
export function conflictEventDates(leads: Lead[]): Set<string> {
  const counts = new Map<string, number>()
  for (const l of leads) {
    if (l.event_date && BOOKABLE_STAGES.includes(l.stage)) {
      counts.set(l.event_date, (counts.get(l.event_date) ?? 0) + 1)
    }
  }
  const out = new Set<string>()
  for (const [date, n] of counts) if (n >= 2) out.add(date)
  return out
}

/**
 * A due-date countdown and the tone it must be painted in, resolved together.
 *
 * The tone travels WITH the text on purpose: the list renders this as a
 * `StatusPill` and previously reached for a flat `Badge variant="secondary"`,
 * so "2 days overdue" and "in 6 days" were the same shade of grey. Deciding the
 * tone here — from the same `dueStatus` the rest of the module uses — means no
 * surface can invent a competing colour for the same state.
 */
export interface Countdown {
  text: string
  tone: Tone
}

export interface PipelineRow {
  lead: Lead
  health: OppHealth
  statusLine: string
  countdown?: Countdown
  quickAction?: 'set_next_step' | 'nudge'
  // Book-by radar datums (undefined when the lead has no event_date).
  eventDate?: string      // the lead's event_date, echoed for the row's time cue
  bookByDate?: string     // event_date − prepLeadDays: the real deadline to close
  daysToBookBy?: number   // signed days from today to bookByDate; negative = past due
  conflict?: boolean      // another bookable lead shares this event_date
}
export interface PipelineGroups {
  needs_attention: PipelineRow[]
  waiting: PipelineRow[]
  active: PipelineRow[]
}

export function countdownLabel(dueYmd: string, today: string): Countdown {
  const tone = DUE_TONE[dueStatus(dueYmd, today)]
  if (dueYmd === today) return { text: 'Today', tone }
  if (dueYmd > today) {
    const n = daysSince(`${today}T00:00:00.000Z`, dueYmd)
    return { text: `in ${n} day${n === 1 ? '' : 's'}`, tone }
  }
  const n = daysSince(`${dueYmd}T00:00:00.000Z`, today)
  return { text: `${n} day${n === 1 ? '' : 's'} overdue`, tone }
}

/** Newest sent-but-never-opened proposal, or null. Reused by the nudge action. */
export function unopenedSentProposal(proposals: Proposal[]): Proposal | null {
  const candidates = proposals.filter((p) => p.status === 'sent' && !isProposalOpened(p))
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a.created_at >= b.created_at ? a : b))
}

export function buildPipelineRows(
  inputs: Array<{ lead: Lead; tasks: Task[]; proposals: Proposal[] }>,
  today: string,
  opts: { prepLeadDays?: number; conflictDates?: Set<string> } = {}
): PipelineGroups {
  const prepLeadDays = opts.prepLeadDays ?? DEFAULT_PREP_LEAD_DAYS
  const conflictDates = opts.conflictDates ?? new Set<string>()
  const groups: PipelineGroups = { needs_attention: [], waiting: [], active: [] }
  for (const { lead, tasks, proposals } of inputs) {
    if (CLOSED_STAGES.includes(lead.stage)) continue
    const health = computeHealth(lead, tasks)
    // Book-by radar datums, computed once per lead and merged into whichever
    // health-group row we push below. A lead with no event_date carries none of
    // these — it can't conflict and it sorts to the no-date tail.
    const eventDate = lead.event_date
    const bookByDate = eventDate ? addDaysYmd(eventDate, -prepLeadDays) : undefined
    const radar = {
      eventDate,
      bookByDate,
      daysToBookBy: bookByDate ? daysBetweenYmd(today, bookByDate) : undefined,
      conflict: eventDate != null && conflictDates.has(eventDate),
    }
    if (health === 'needs_attention') {
      const unopened = unopenedSentProposal(proposals)
      if (unopened) {
        // The sentence needs the actual send time, not draft-creation time; fall back
        // to created_at for legacy proposals with no recorded 'sent' event.
        const sentAt = unopened.events?.find((e) => e.kind === 'sent')?.at ?? unopened.created_at
        const n = daysSince(sentAt, today)
        groups.needs_attention.push({
          lead, health, quickAction: 'nudge', ...radar,
          statusLine: `Proposal sent ${n} day${n === 1 ? '' : 's'} ago — no opens`,
        })
      } else {
        const quiet = daysSince(lastTouchIso(lead), today)
        groups.needs_attention.push({
          lead, health, quickAction: 'set_next_step', ...radar,
          statusLine: `No next step — last touched ${quiet} day${quiet === 1 ? '' : 's'} ago`,
        })
      }
    } else if (health === 'waiting') {
      const w = lead.waiting!
      groups.waiting.push({
        lead, health, ...radar,
        // ONE date format across the module. This emitted a raw ISO ymd, which
        // on a board card landed two lines under `shortDate(event_date)` —
        // "Sep 4, 2026" above "follow up 2026-08-09" reads as two different
        // kinds of date. wave1-addenda §BINDING: pick one format per region.
        statusLine: `Waiting on them — ${w.reason}${w.follow_up_date ? ` · follow up ${shortDate(w.follow_up_date)}` : ''}`,
        countdown: w.follow_up_date ? countdownLabel(w.follow_up_date, today) : undefined,
      })
    } else if (health === 'active') {
      const next = nextAction(tasks)!
      groups.active.push({
        lead, health, ...radar,
        statusLine: `Next: ${next.title} · due ${shortDate(next.due_date!)}`,
        countdown: next.due_date ? countdownLabel(next.due_date, today) : undefined,
      })
    }
  }
  // Deadline-first ordering within each health group: a same-day booking
  // conflict is the loudest signal, then the soonest book-by deadline, then
  // no-date rows to the tail. Touch-staleness — the module's old primary key —
  // survives only as the final tiebreaker between two otherwise-equal rows.
  const byBookBy = (a: PipelineRow, b: PipelineRow) => {
    if (a.conflict !== b.conflict) return a.conflict ? -1 : 1
    if (a.bookByDate && b.bookByDate) {
      if (a.bookByDate !== b.bookByDate) return a.bookByDate < b.bookByDate ? -1 : 1
    } else if (a.bookByDate) {
      return -1
    } else if (b.bookByDate) {
      return 1
    }
    return lastTouchIso(a.lead).localeCompare(lastTouchIso(b.lead))
  }
  groups.needs_attention.sort(byBookBy)
  groups.waiting.sort(byBookBy)
  groups.active.sort(byBookBy)
  return groups
}

export function closedThisMonth(leads: Lead[], today: string) {
  const month = today.slice(0, 7)
  const won = wonValueInMonth(leads, month)
  const lost = leads.filter((l) => l.stage === 'closed_lost' && l.closed_at?.slice(0, 7) === month)
  return {
    wonCount: won.count,
    wonValue: won.value,
    lostCount: lost.length,
    lostValue: lost.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
  }
}
