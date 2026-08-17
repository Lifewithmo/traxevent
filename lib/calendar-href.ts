// The one link builder for the calendar cockpit. Every internal nav — view
// tabs, week stepping, mini-month jumps, day-cell links, the runway strip and
// the day spine — routes through here so `?view` / `?week` / `?kinds` survive
// every hop (the calendar has a documented history of silently dropping them).
//
// `ymd` becomes a path segment (`/calendar/2026-08-20`); the rest stay query
// params in a fixed order so links are stable and diffable. Falsy params are
// dropped rather than emitted as bare keys.

export interface CalendarHrefParams {
  orgSlug: string
  /** Month | Week | Day | Agenda — the canvas view. */
  view?: string
  /** Monday anchor of the shown week (or any ymd within it). */
  week?: string
  /** Kind filter scope, e.g. 'pipeline'. */
  kinds?: string
  /** When set, routes to the day-detail spine at `/calendar/[ymd]`. */
  ymd?: string
}

export function calendarHref({ orgSlug, view, week, kinds, ymd }: CalendarHrefParams): string {
  const base = ymd ? `/${orgSlug}/calendar/${ymd}` : `/${orgSlug}/calendar`
  const q = new URLSearchParams()
  if (view) q.set('view', view)
  if (week) q.set('week', week)
  if (kinds) q.set('kinds', kinds)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
