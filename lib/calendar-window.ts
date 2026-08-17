import { addDays } from '@/lib/opportunity-detail'
import { weekRange, type CalendarItem } from '@/lib/calendar'

// The visible window each canvas view needs. The cockpit page bounds its feed to
// this span (span-aware) rather than handing the grid the whole unbounded feed —
// so a day-nav re-renders a window, not the entire multi-year agenda. Agenda is
// the exception: it lists the full feed by month, so it opts out (null).

export type CanvasView = 'month' | 'week' | 'day' | 'agenda'

/** Coerce an untrusted `?view` param to a known view; default Week. */
export function normalizeView(v?: string): CanvasView {
  return v === 'month' || v === 'day' || v === 'agenda' ? v : 'week'
}

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function calendarWindow(view: CanvasView, anchor: string): { from: string; to: string } | null {
  const a = anchor.slice(0, 10)
  if (view === 'agenda') return null
  if (view === 'day') return { from: a, to: a }
  if (view === 'week') return weekRange(a)
  // month: the padded Monday-start grid (mirrors MonthGrid), so the trailing days
  // of the flanking months still resolve their items.
  const monthKey = a.slice(0, 7)
  const firstYmd = `${monthKey}-01`
  const firstDow = new Date(`${firstYmd}T00:00:00.000Z`).getUTCDay() // 0 Sun … 6 Sat
  const lead = (firstDow + 6) % 7
  const gridStart = addDays(firstYmd, -lead)
  const total = Math.ceil((lead + daysInMonth(monthKey)) / 7) * 7
  return { from: gridStart, to: addDays(gridStart, total - 1) }
}

/** Span-aware bound: keep every item overlapping the view's window (a superset of
 *  feedInRange, so multi-day events that start before the window still render —
 *  matching the WeekGrid/MonthGrid feedForDay contract). */
export function feedInWindow(items: CalendarItem[], view: CanvasView, anchor: string): CalendarItem[] {
  const w = calendarWindow(view, anchor)
  if (!w) return items
  return items.filter((i) => {
    const from = i.date.slice(0, 10)
    const to = (i.endDate ?? i.date).slice(0, 10)
    return from <= w.to && to >= w.from
  })
}
