import type { Org } from '@/lib/types'

/**
 * The weekday (0=Sun … 6=Sat) of an ISO `ymd` string, computed from its parts
 * via `Date.UTC` so it never drifts by the runner's local timezone. Never
 * `new Date(ymd)` — that parses as UTC midnight and prints local, shifting the
 * day west of UTC.
 */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * A date is serviceable when its weekday is in the operator's set (or the set is
 * absent ⇒ all weekdays serve) AND it falls in none of the closure ranges
 * (inclusive of both endpoints). An empty `weekdays` array ⇒ no day serves.
 */
export function isServiceable(ymd: string, cfg: Org['serviceable_days']): boolean {
  const weekdays = cfg?.weekdays
  // `weekdays` absent ⇒ all weekdays serve; present (incl. []) ⇒ membership test.
  if (weekdays && !weekdays.includes(weekdayOf(ymd))) return false
  const closures = cfg?.closures ?? []
  if (closures.some((c) => c.start <= ymd && ymd <= c.end)) return false
  return true
}

/**
 * Ascending ISO ymds within month `ym` ('YYYY-MM') that are >= `fromYmd` and
 * serviceable under `cfg`. Used to count and iterate the real working days a
 * forecast window covers.
 */
export function serviceableDatesInMonth(
  ym: string,
  fromYmd: string,
  cfg: Org['serviceable_days'],
): string[] {
  const [y, m] = ym.split('-').map(Number)
  // Day 0 of month m+1 (1-indexed m) = the last day of month m.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const out: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${ym}-${String(d).padStart(2, '0')}`
    if (ymd >= fromYmd && isServiceable(ymd, cfg)) out.push(ymd)
  }
  return out
}
