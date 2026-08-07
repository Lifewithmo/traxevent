/** Pure date math relative to a caller-supplied `today`. No clock reads — the
 *  whole seed graph must be a deterministic function of one Date. */

const DAY_MS = 24 * 60 * 60 * 1000

/** ISO calendar date (`YYYY-MM-DD`) `n` days from `today`. Negative = past. */
export function daysFrom(today: Date, n: number): string {
  return new Date(today.getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

/** Full ISO datetime `n` days from `today`, at `hhmm` UTC (default noon). */
export function isoFrom(today: Date, n: number, hhmm = '12:00'): string {
  return `${daysFrom(today, n)}T${hhmm}:00.000Z`
}
