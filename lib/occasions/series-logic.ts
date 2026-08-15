import type { SeriesRecurrence } from '@/lib/types'

export const SERIES_OCCURRENCE_CAP = 30

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// UTC-noon anchoring makes weekday/date arithmetic immune to DST and the
// host timezone — the strings in and out are plain calendar dates.
function toUtc(day: string): Date {
  return new Date(`${day}T12:00:00Z`)
}
function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Every date in [from, until] falling on `weekday`, ascending. Pure calendar
 * math; throws when the season would exceed SERIES_OCCURRENCE_CAP days —
 * "Extend series" generates further spans later (spec §3.2).
 */
export function seriesOccurrences(rec: SeriesRecurrence): string[] {
  if (rec.freq !== 'weekly') throw new Error('Only weekly series are supported')
  if (!Number.isInteger(rec.weekday) || rec.weekday < 0 || rec.weekday > 6) {
    throw new Error('Invalid weekday')
  }
  if (!DAY_RE.test(rec.from) || !DAY_RE.test(rec.until)) {
    throw new Error('Series dates must be YYYY-MM-DD')
  }
  const from = toUtc(rec.from)
  const until = toUtc(rec.until)
  if (Number.isNaN(from.getTime()) || toDay(from) !== rec.from ||
      Number.isNaN(until.getTime()) || toDay(until) !== rec.until) {
    throw new Error('Series dates must be YYYY-MM-DD')
  }
  if (until.getTime() < from.getTime()) throw new Error('A series must end after it starts')

  const first = new Date(from)
  const delta = (rec.weekday - first.getUTCDay() + 7) % 7
  first.setUTCDate(first.getUTCDate() + delta)

  const days: string[] = []
  for (const d = new Date(first); d.getTime() <= until.getTime(); d.setUTCDate(d.getUTCDate() + 7)) {
    days.push(toDay(d))
    if (days.length > SERIES_OCCURRENCE_CAP) {
      throw new Error(`A series can generate at most ${SERIES_OCCURRENCE_CAP} days — shorten the season and extend it later`)
    }
  }
  return days
}
