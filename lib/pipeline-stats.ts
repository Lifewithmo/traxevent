import type { Lead } from '@/lib/types'
import { OPEN_STAGES } from '@/lib/leads'

export interface BacklogMonth {
  ym: string      // '2026-08'
  label: string   // 'Aug'
  booked: number  // closed_won estimated_value with event_date in this month
  open: number    // open-stage estimated_value with event_date in this month
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function wonValueInMonth(leads: Lead[], ym: string): { count: number; value: number } {
  const won = leads.filter((l) => l.stage === 'closed_won' && l.closed_at?.slice(0, 7) === ym)
  return { count: won.length, value: won.reduce((s, l) => s + (l.estimated_value ?? 0), 0) }
}

export function bookedAhead(leads: Lead[], today: string, days = 90): { count: number; value: number } {
  const end = addDaysYmd(today, days)
  const inWindow = leads.filter(
    (l) => l.stage === 'closed_won' && l.event_date && l.event_date >= today && l.event_date < end
  )
  return { count: inWindow.length, value: inWindow.reduce((s, l) => s + (l.estimated_value ?? 0), 0) }
}

function buildBacklogRows(leads: Lead[], start: string, length: number): BacklogMonth[] {
  return Array.from({ length }, (_, i) => {
    const ym = addMonths(start, i)
    const inMonth = leads.filter((l) => l.event_date?.slice(0, 7) === ym)
    const sum = (ls: Lead[]) => ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
    return {
      ym,
      label: MONTHS[Number(ym.slice(5)) - 1],
      booked: sum(inMonth.filter((l) => l.stage === 'closed_won')),
      open: sum(inMonth.filter((l) => OPEN_STAGES.includes(l.stage))),
    }
  })
}

export function backlogByMonth(leads: Lead[], today: string, months = 6): BacklogMonth[] {
  return buildBacklogRows(leads, today.slice(0, 7), months)
}

// Rolling window spanning `back` months before the current month through
// `ahead` months after it (inclusive of the current month), for the KPI
// band's revenue-by-month chart — replaces the forward-only backlogByMonth
// for that use case.
export function backlogWindow(leads: Lead[], today: string, back = 5, ahead = 6): BacklogMonth[] {
  const start = addMonths(today.slice(0, 7), -back)
  return buildBacklogRows(leads, start, back + ahead + 1)
}
