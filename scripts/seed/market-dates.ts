import { daysFrom } from '@/scripts/seed/dates'

/** Sunday=0 … Saturday=6, matching SeriesRecurrence.weekday. */
export const SATURDAY = 6

/**
 * The walkthrough's cadence window around `today`: five past cadence days, the
 * anchor day (today itself when it falls on the cadence weekday, else the next
 * occurrence), and two future cadence days after the anchor.
 *
 * When today is NOT the cadence day, `extraToday` carries today's own date so
 * the seeder can still put a day-of market day on the calendar — the
 * closeout-lite CTA and the Today-agenda "Close out" link only render for a
 * market day whose date IS today.
 *
 * Pure calendar math off scripts/seed/dates.daysFrom (UTC, like the rest of
 * the seed graph): same `today` in, identical strings out.
 */
export interface CadenceWindow {
  /** YYYY-MM-DD of `today` itself. */
  today: string
  /** Five past cadence days, ascending, all strictly before `today`. */
  past: string[]
  /** `today` when it is not a cadence day (needs its own seeded day), else null. */
  extraToday: string | null
  /** `today` when it falls on the cadence weekday, else the next occurrence. */
  anchor: string
  /** Two cadence days after `anchor`, ascending. */
  future: string[]
}

export function cadenceWindowAround(today: Date, weekday: number = SATURDAY): CadenceWindow {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`Invalid weekday: ${weekday}`)
  }
  const todayYmd = daysFrom(today, 0)
  // UTC-noon anchoring, matching lib/occasions/series-logic: the string is a
  // plain calendar date, so weekday math must not wobble with the host tz.
  const dow = new Date(`${todayYmd}T12:00:00Z`).getUTCDay()

  const toNext = (weekday - dow + 7) % 7 // 0 when today IS the cadence day
  const anchorOffset = toNext
  const lastPastOffset = toNext === 0 ? -7 : toNext - 7

  const past = [-28, -21, -14, -7, 0].map((w) => daysFrom(today, lastPastOffset + w))
  return {
    today: todayYmd,
    past,
    extraToday: toNext === 0 ? null : todayYmd,
    anchor: daysFrom(today, anchorOffset),
    future: [7, 14].map((w) => daysFrom(today, anchorOffset + w)),
  }
}
