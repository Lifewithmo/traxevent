// Shared presentation vocabulary for the Events module.
// Pure data + formatters — no React, no Firestore, importable from server and client.

export type PillTone = 'confirmed' | 'pending' | 'alert' | 'neutral'

// Single source for registration-status pills (was duplicated verbatim in
// FamiliesTable and FamilySlideOver; AssignmentsClient/CheckinClient rendered
// the same statuses as plain Badges).
export const FAMILY_TONE = {
  pending: 'pending',
  confirmed: 'confirmed',
  waitlisted: 'alert',
  cancelled: 'neutral',
} as const satisfies Record<string, PillTone>

export const FAMILY_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlist',
  cancelled: 'Cancelled',
} as const

export const EVENT_STATUS_TONE = {
  draft: 'pending',
  active: 'confirmed',
  archived: 'neutral',
} as const satisfies Record<string, PillTone>

export const EVENT_STATUS_LABEL = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
} as const

/** Parse a YYYY-MM-DD date string as a local date (avoids the UTC-midnight day shift). */
export function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

/** "2026-08-01" → "Aug 1, 2026" (empty string for unparseable input). */
export function formatEventDate(day: string): string {
  const d = parseDay(day)
  if (!d) return ''
  return `${d.toLocaleDateString('en-US', MONTH_DAY)}, ${d.getFullYear()}`
}

/**
 * Compact range: same day → "Aug 1, 2026"; same month → "Aug 1–3, 2026";
 * same year → "Aug 30 – Sep 2, 2026"; else both years spelled out.
 */
export function formatEventDateRange(start: string, end?: string): string {
  const s = parseDay(start)
  if (!s) return ''
  const e = end ? parseDay(end) : null
  if (!e || e.getTime() === s.getTime()) return formatEventDate(start)
  const sMD = s.toLocaleDateString('en-US', MONTH_DAY)
  if (s.getFullYear() !== e.getFullYear()) {
    return `${sMD}, ${s.getFullYear()} – ${e.toLocaleDateString('en-US', MONTH_DAY)}, ${e.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth()) return `${sMD}–${e.getDate()}, ${s.getFullYear()}`
  return `${sMD} – ${e.toLocaleDateString('en-US', MONTH_DAY)}, ${s.getFullYear()}`
}

/**
 * Countdown copy for the spine: days until start, "Today" while in progress,
 * "Wrapped" once ended. `today` is a YYYY-MM-DD string for testability.
 */
export function eventCountdown(start: string, end: string | undefined, today: string): { value: string; note: string } {
  const s = parseDay(start)
  const t = parseDay(today)
  if (!s || !t) return { value: '—', note: 'No date set' }
  const e = (end && parseDay(end)) || s
  const dayMs = 24 * 60 * 60 * 1000
  const diff = Math.round((s.getTime() - t.getTime()) / dayMs)
  if (t.getTime() > e.getTime()) return { value: 'Wrapped', note: formatEventDateRange(start, end) }
  if (diff <= 0) return { value: 'Today', note: 'Event in progress' }
  return { value: `${diff}d`, note: `Starts ${formatEventDate(start)}` }
}
