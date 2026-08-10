import { addDays } from '@/lib/opportunity-detail'
import type { CalendarItem } from '@/lib/calendar'

const MONTHS_UP = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTHS_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const MONTHS_LIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']          // getUTCDay order
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function utcDay(ymd: string): number {
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay()
}

/** The ten-day availability window: five days before the center, the center, four after. */
export function windowDays(centerYmd: string): string[] {
  return Array.from({ length: 10 }, (_, i) => addDays(centerYmd, i - 5))
}

export function rangeLabel(days: string[]): string {
  const a = parts(days[0])
  const b = parts(days[days.length - 1])
  const left = `${MONTHS_UP[a.m - 1]} ${a.d}`
  return a.m === b.m && a.y === b.y ? `${left} – ${b.d}` : `${left} – ${MONTHS_UP[b.m - 1]} ${b.d}`
}

export function daysOutLabel(eventYmd: string | undefined, today: string): string | null {
  if (!eventYmd) return null
  const diff = Math.round(
    (Date.parse(`${eventYmd}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000
  )
  if (diff === 0) return 'today'
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} out`
  return `${-diff} day${diff === -1 ? '' : 's'} ago`
}

export function monthStartOf(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

export function addMonths(monthStartYmd: string, delta: number): string {
  const { y, m } = parts(monthStartYmd)
  const zero = y * 12 + (m - 1) + delta
  const ny = Math.floor(zero / 12)
  const nm = (zero % 12 + 12) % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}-01`
}

export function monthLabel(monthStartYmd: string): string {
  const { y, m } = parts(monthStartYmd)
  return `${MONTHS_FULL[m - 1]} ${y}`
}

export interface MonthCell { ymd: string; inMonth: boolean }

/** Monday-first full weeks covering the month (adjacent-month fill days included). */
export function monthGrid(monthStartYmd: string): MonthCell[] {
  const month = monthStartYmd.slice(0, 7)
  const monthEnd = addDays(addMonths(monthStartYmd, 1), -1)
  const gridStart = addDays(monthStartYmd, -((utcDay(monthStartYmd) + 6) % 7))
  const gridEnd = addDays(monthEnd, 6 - ((utcDay(monthEnd) + 6) % 7))
  const cells: MonthCell[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    cells.push({ ymd: d, inMonth: d.slice(0, 7) === month })
  }
  return cells
}

/** Items keyed by YYYY-MM-DD, restricted to the given days. */
export function bucketByDay(items: CalendarItem[], days: string[]): Record<string, CalendarItem[]> {
  const wanted = new Set(days)
  const buckets: Record<string, CalendarItem[]> = {}
  for (const item of items) {
    const day = item.date.slice(0, 10)
    if (!wanted.has(day)) continue
    ;(buckets[day] ??= []).push(item)
  }
  return buckets
}

export function shortDayLabel(ymd: string): { weekday: string; day: number } {
  return { weekday: WEEKDAY_INITIALS[utcDay(ymd)], day: parts(ymd).d }
}

export function listDateLabel(ymd: string): string {
  const { m, d } = parts(ymd)
  return `${WEEKDAYS_SHORT[utcDay(ymd)]} ${MONTHS_LIST[m - 1]} ${d}`
}
