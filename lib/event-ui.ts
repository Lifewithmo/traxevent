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

// ── Job time + back-planning helpers (B7 + accepted ratchet) ─────────────────
// CANONICAL home for the time vocabulary shared by the dashboard brief
// (lib/event-spine.ts re-exports these) and the run sheet's anchor logic —
// one implementation, so "Pack by / Leave by" can never disagree between the
// brief and the run sheet for the same event.

/** 'HH:mm' / 'H:mm' (24h) → '3:00 PM'. null for malformed input. */
export function formatClockTime(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  if (h > 23 || Number(m[2]) > 59) return null
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

export interface JobStripTime {
  /** HONEST about its source (B7): 'Service 3:00 PM' | 'Starts 2:00 PM' | 'First item 1:30 PM'. */
  label: string
  /** The resolved 24h 'HH:mm' backing the back-planned chips. */
  hhmm: string
  source: 'service' | 'hours' | 'itinerary'
}

/** B7 precedence: ops service_start → event.hours.start → first itinerary item → null ("Time TBD"). */
export function resolveJobTime(input: {
  serviceStart?: string
  hoursStart?: string
  firstItineraryTime?: string | null
}): JobStripTime | null {
  const service = input.serviceStart?.slice(11, 16)
  if (service) {
    const t = formatClockTime(service)
    if (t) return { label: `Service ${t}`, hhmm: service, source: 'service' }
  }
  if (input.hoursStart) {
    const t = formatClockTime(input.hoursStart)
    if (t) return { label: `Starts ${t}`, hhmm: input.hoursStart, source: 'hours' }
  }
  if (input.firstItineraryTime) {
    const t = formatClockTime(input.firstItineraryTime)
    if (t) return { label: `First item ${t}`, hhmm: input.firstItineraryTime, source: 'itinerary' }
  }
  return null
}

export const PACK_MINUTES = 45
export const DRIVE_MINUTES = 30

/**
 * Sanity ceiling for the org pack/drive buffers: nobody packs or drives for
 * more than 8 hours before a job. SINGLE source — actions/ops-buffers.ts
 * enforces it server-side and CapacityUnitsClient mirrors it in the inputs'
 * `max`, the pre-flight parse, and the error copy. It lives here (not in the
 * action) because a 'use server' module may only export async functions.
 */
export const MAX_BUFFER_MINUTES = 480

/**
 * Read-cost cap on the series season rollup (newest days ≤ today win the
 * budget). Lives here (client-safe) so SeriesClient's copy can interpolate the
 * same number the server slices by; lib/ops/closeout.ts re-exports it.
 */
export const SERIES_ROLLUP_CAP = 30

/** Org-default pack/drive buffers (Org.ops_buffers shape); absent fields fall back to the constants. */
export interface OpsBuffers {
  pack_minutes?: number
  drive_minutes?: number
}

/** Effective buffer minutes after fallback — single source for chips and labels. */
export function resolveBuffers(buffers?: OpsBuffers): { pack: number; drive: number } {
  return {
    pack: buffers?.pack_minutes && buffers.pack_minutes > 0 ? buffers.pack_minutes : PACK_MINUTES,
    drive: buffers?.drive_minutes && buffers.drive_minutes > 0 ? buffers.drive_minutes : DRIVE_MINUTES,
  }
}

/** The assumption caption rendered wherever the chips render, e.g. "assumes 50m pack · 20m drive". */
export function bufferAssumptionLabel(buffers?: OpsBuffers): string {
  const { pack, drive } = resolveBuffers(buffers)
  return `assumes ${pack}m pack · ${drive}m drive`
}

/**
 * Back-planned 'Pack by / Leave by' from the resolved job time minus the org's
 * buffers (fixed 45m/30m defaults when unset) — always labeled as an assumption
 * via bufferAssumptionLabel. null when the time is malformed or back-planning
 * crosses midnight.
 */
export function backPlanChips(hhmm: string, buffers?: OpsBuffers): { packBy: string; leaveBy: string } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const { pack: packMin, drive: driveMin } = resolveBuffers(buffers)
  const start = Number(m[1]) * 60 + Number(m[2])
  const leave = start - driveMin
  const pack = leave - packMin
  if (pack < 0) return null
  const fmt = (mins: number) =>
    formatClockTime(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
  const packBy = fmt(pack)
  const leaveBy = fmt(leave)
  return packBy && leaveBy ? { packBy, leaveBy } : null
}
