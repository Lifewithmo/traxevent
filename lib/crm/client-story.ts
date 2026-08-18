import { LEAD_STAGE_LABELS, OPEN_STAGES, opportunityTitle } from '@/lib/leads'
import { cadenceLabel, type ClientRow } from '@/lib/crm/client-list'
import { offBeatMonths } from '@/lib/crm/cadence'
import type { Lead, LeadStage } from '@/lib/types'

/**
 * A client is a pattern, not a row. The rollup already holds the numbers;
 * this turns them into the claim they add up to — including the claim that
 * matters most, "you haven't heard from them in 14 months."
 */
export interface ClientStory {
  /** Sentence fragments, joined by the view. Empty for a brand-new client. */
  parts: string[]
  /** True when the lede's headline fact is silence, not volume. */
  dormant: boolean
}

export interface TimelineEntry {
  leadId: string
  title: string
  date?: string
  /** 'booked' | 'past' | 'open' | 'lost' — drives weight, not colour. */
  kind: 'booked' | 'past' | 'open' | 'lost'
  detail: string
  value?: number
}

function monthYear(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function buildClientStory(row: ClientRow, leads: Lead[], today: string): ClientStory {
  const { rollup } = row
  const parts: string[] = []

  const wonDates = leads
    .filter((l) => l.stage === 'closed_won' && l.event_date)
    .map((l) => l.event_date!.slice(0, 10))
    .sort()

  if (rollup.wonCount > 0) {
    const first = wonDates[0]
    // totalWonValue is QUOTED won value, not cash collected — the KPI band's
    // ar.paid is the real "paid" figure. Say "booked" here so the two never
    // contradict each other.
    parts.push(
      `${rollup.wonCount} ${rollup.wonCount === 1 ? 'event' : 'events'}${first ? ` since ${monthYear(first)}` : ''}, ${money(rollup.totalWonValue)} booked`
    )
  }

  if (row.nextEventDate) {
    parts.push(`next one booked for ${monthYear(row.nextEventDate)}`)
  } else if (offBeatMonths(row, today) != null && row.monthsSinceLastEvent !== undefined) {
    // Dormancy is now cadence-relative: flag them only when they are past their
    // own re-book beat, not on a flat six-month timer.
    parts.push(`nothing booked in ${row.monthsSinceLastEvent} months`)
  }

  const cadence = cadenceLabel(row)
  if (cadence) parts.push(`books ${cadence}`)

  // Guest-count trend, but only when it actually moves.
  const counts = leads
    .filter((l) => l.stage === 'closed_won' && l.guest_count && l.event_date)
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!))
    .map((l) => l.guest_count!)
  if (counts.length >= 3 && counts[counts.length - 1] > counts[0]) {
    parts.push(`guest count climbing ${counts.join(' → ')}`)
  }

  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const open = leads.filter((l) => isOpen(l.stage))
  if (open.length === 1) {
    const l = open[0]
    parts.push(
      `one still open: ${opportunityTitle(l)}${l.event_date ? ` on ${l.event_date.slice(5)}` : ''}${l.waiting ? `, waiting on ${l.waiting.reason}` : ''}`
    )
  } else if (open.length > 1) {
    parts.push(`${open.length} open, ${money(rollup.openValue)}`)
  }

  return { parts, dormant: row.group === 'dormant_repeat' }
}

export function buildTimeline(leads: Lead[], today: string): TimelineEntry[] {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)

  return leads
    .map((l): TimelineEntry => {
      const date = l.event_date?.slice(0, 10)
      const future = !!date && date > today
      const kind: TimelineEntry['kind'] =
        l.stage === 'closed_lost' ? 'lost' : isOpen(l.stage) ? 'open' : future ? 'booked' : 'past'
      const detail =
        kind === 'lost'
          ? `Lost${l.lost?.reason ? ` · ${l.lost.reason.replace(/_/g, ' ')}` : ''}`
          : kind === 'open'
            ? `${LEAD_STAGE_LABELS[l.stage]}${l.waiting ? ` · waiting on ${l.waiting.reason}` : ''}`
            : [kind === 'booked' ? 'Booked' : 'Delivered', l.guest_count ? `${l.guest_count} guests` : null]
                .filter(Boolean)
                .join(' · ')
      return { leadId: l.id, title: opportunityTitle(l), date, kind, detail, value: l.estimated_value }
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** Where the "today" divider falls in a reverse-chronological timeline. */
export function todayDividerIndex(entries: TimelineEntry[], today: string): number {
  const i = entries.findIndex((e) => e.date && e.date <= today)
  return i === -1 ? entries.length : i
}

