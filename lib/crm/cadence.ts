import { monthsBetween, type ClientRow } from '@/lib/crm/client-list'

/**
 * Re-book cadence: how often, in months, a client comes back — projected forward
 * so dormancy is measured against *their* beat instead of a flat six-month rule.
 * A yearly client silent seven months is on time; a monthly client silent three
 * is already overdue. The old `monthsSinceLastEvent >= 6` test got both wrong.
 */

/** Add whole months to a YYYY-MM-DD date, clamping to the last valid day of the target month. */
function addMonths(ymd: string, months: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return ymd.slice(0, 10)
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d.getUTCDate(), lastDay)
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

/**
 * The cadence to project a next booking from:
 * - 3+ won events → the averaged cadence already on the row (`cadenceMonths`)
 * - exactly 2 events → the single gap between them
 * - 1 event → assume yearly (12)
 * - 0 events → null (nothing to project)
 */
export function effectiveCadenceMonths(row: ClientRow): number | null {
  const won = row.rollup.wonCount
  if (won === 0) return null
  if (won === 1) return 12
  if (row.cadenceMonths != null) return row.cadenceMonths
  // Exactly two won events: cadenceMonths stays undefined, so use the raw gap.
  if (row.firstEventDate && row.lastEventDate) {
    return monthsBetween(row.firstEventDate, row.lastEventDate)
  }
  return null
}

/** When this client is due to book again: last event + cadence, as YYYY-MM-DD. */
export function projectedNextBooking(
  lastEventDate: string | null,
  effectiveCadenceMonths: number | null
): string | null {
  if (!lastEventDate || effectiveCadenceMonths == null) return null
  return addMonths(lastEventDate, effectiveCadenceMonths)
}

/**
 * Whole months past the projected next booking. Positive means the client is
 * overdue on their own pattern; null when they are on beat or have no cadence.
 */
export function offBeatMonths(row: ClientRow, todayYmd: string): number | null {
  const projected = projectedNextBooking(row.lastEventDate ?? null, effectiveCadenceMonths(row))
  if (!projected) return null
  const past = monthsBetween(projected, todayYmd)
  return past > 0 ? past : null
}
