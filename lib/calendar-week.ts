import type { CalendarItem } from '@/lib/calendar'
import { addDays } from '@/lib/opportunity-detail'

// Pure derivations over already-fetched CalendarItems: what the Calendar KPI
// band summarises for the shown week, and what the needs-attention rail lists
// across the whole feed. No fetching, no React, no server imports.

const ymd = (date: string) => date.slice(0, 10)

export interface WeekRollup {
  eventCount: number
  guestCount: number
  tentativeCount: number
  /** Open tasks + follow-ups landing in the week — the pipeline band's figure. */
  taskCount: number
  dueAmount: number
  overdueDueAmount: number
  blockerCount: number
}

/** Rollup of items ALREADY scoped to the shown week (caller does the range filter). */
export function weekRollup(weekItems: CalendarItem[], today: string): WeekRollup {
  const todayYmd = ymd(today)
  const rollup: WeekRollup = {
    eventCount: 0,
    guestCount: 0,
    tentativeCount: 0,
    taskCount: 0,
    dueAmount: 0,
    overdueDueAmount: 0,
    blockerCount: 0,
  }
  for (const item of weekItems) {
    if (item.kind === 'event') {
      rollup.eventCount += 1
      rollup.guestCount += item.headcount ?? 0
    }
    if (item.kind === 'task' || item.kind === 'follow_up') rollup.taskCount += 1
    if (item.tentative === true) rollup.tentativeCount += 1
    if (item.blocker === true) rollup.blockerCount += 1
    if (item.kind === 'invoice_due') {
      const amount = item.amount ?? 0
      rollup.dueAmount += amount
      if (ymd(item.date) < todayYmd) rollup.overdueDueAmount += amount
    }
  }
  return rollup
}

export type AttentionReason = 'blocker' | 'overdue' | 'money' | 'unbooked'

export interface AttentionEntry {
  item: CalendarItem
  reason: AttentionReason
  overdue: boolean
}

export interface AttentionGroup {
  key: AttentionReason
  label: string
  entries: AttentionEntry[]
}

const ATTENTION_LABELS: Record<AttentionReason, string> = {
  blocker: 'Blocking a booked event',
  overdue: 'Past due',
  money: 'Money owed',
  unbooked: 'Not booked yet',
}

/** Group order is fixed — worst first — regardless of what the feed contains. */
const ATTENTION_ORDER: AttentionReason[] = ['blocker', 'overdue', 'money', 'unbooked']

// First match wins: a blocking compliance doc that is also past due is a
// blocker, and an invoice on a tentative hold is money.
function classify(item: CalendarItem, overdue: boolean): AttentionReason | null {
  if (item.blocker === true) return 'blocker'
  if ((item.kind === 'task' || item.kind === 'follow_up') && overdue) return 'overdue'
  if (item.kind === 'invoice_due') return 'money'
  if (item.tentative === true) return 'unbooked'
  return null
}

/** Everything on the whole feed that needs a decision. */
export function needsAttention(
  items: CalendarItem[],
  today: string,
  horizonDays = 30
): AttentionGroup[] {
  const todayYmd = ymd(today)
  const horizon = addDays(todayYmd, horizonDays)
  const byReason = new Map<AttentionReason, AttentionEntry[]>()

  for (const item of items) {
    const date = ymd(item.date)
    const overdue = date < todayYmd
    // Past due is always kept, however old; ahead of today only to the horizon.
    if (!overdue && date > horizon) continue
    const reason = classify(item, overdue)
    if (!reason) continue
    const entries = byReason.get(reason)
    if (entries) entries.push({ item, reason, overdue })
    else byReason.set(reason, [{ item, reason, overdue }])
  }

  const groups: AttentionGroup[] = []
  for (const key of ATTENTION_ORDER) {
    const entries = byReason.get(key)
    if (!entries?.length) continue
    entries.sort(
      (a, b) => ymd(a.item.date).localeCompare(ymd(b.item.date)) || a.item.id.localeCompare(b.item.id)
    )
    groups.push({ key, label: ATTENTION_LABELS[key], entries })
  }
  return groups
}

export function attentionCount(groups: AttentionGroup[]): number {
  return groups.reduce((sum, g) => sum + g.entries.length, 0)
}
