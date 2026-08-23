// Runsheet-specific glue over the shared job-time/back-plan helpers — used by
// the live page, the print route, and RunSheetClient (no directives, so it
// imports cleanly on both sides of the server/client boundary).
//
// B7 (time-source honesty): the anchor time always says WHERE it came from.
// Precedence: ops-plan service start ("Service 3:00 PM") → event booking hours
// ("Starts 2:00 PM") → earliest TIMED itinerary item ("First item 1:30 PM") →
// no anchor at all ("Time TBD" — never a fabricated time).

import type { ItineraryDay } from '@/lib/itinerary'

// ── Shared implementations (consolidation contract) ──────────────────────────
// TODO(F1): switch to `import { formatClockTime, resolveJobTime, backPlanChips,
// PACK_MINUTES, DRIVE_MINUTES } from '@/lib/event-ui'` after F1 lands, deleting
// everything down to "end shared" (keep re-exporting PACK_MINUTES/DRIVE_MINUTES
// — the anchor tests import them from here). These are VERBATIM copies of
// lib/event-spine's formatClockTime/resolveJobTime/backPlanChips, kept local
// only because lib/event-spine value-imports firebase-admin (`server-only`) and
// this module is bundled into the 'use client' RunSheetClient — importing
// event-spine here fails `next build`.

/** 'HH:mm' / 'H:mm' (24h) → '3:00 PM'. null for malformed input. */
function formatClockTime(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  if (h > 23 || Number(m[2]) > 59) return null
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

interface JobStripTime {
  /** HONEST about its source (B7): 'Service 3:00 PM' | 'Starts 2:00 PM' | 'First item 1:30 PM'. */
  label: string
  /** The resolved 24h 'HH:mm' backing the back-planned chips. */
  hhmm: string
  source: 'service' | 'hours' | 'itinerary'
}

/** B7 precedence: ops service_start → event.hours.start → first itinerary item → null ("Time TBD"). */
function resolveJobTime(input: {
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

// Fixed default buffers (accepted ratchet): zero storage, labeled as
// assumptions wherever the chips render. Configurable buffers are named
// increment-2 work.
export const PACK_MINUTES = 45
export const DRIVE_MINUTES = 30

/**
 * Back-planned 'Pack by / Leave by' from the resolved time minus the fixed
 * buffers. null when the time is malformed or back-planning crosses midnight —
 * a "Pack by 11:40 PM" the night before would be a claim about the wrong day.
 */
function backPlanChips(hhmm: string): { packBy: string; leaveBy: string } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const start = Number(m[1]) * 60 + Number(m[2])
  const leave = start - DRIVE_MINUTES
  const pack = leave - PACK_MINUTES
  if (pack < 0) return null
  const fmt = (mins: number) =>
    formatClockTime(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
  const packBy = fmt(pack)
  const leaveBy = fmt(leave)
  return packBy && leaveBy ? { packBy, leaveBy } : null
}
// ── end shared ───────────────────────────────────────────────────────────────

export interface AnchorTime {
  /** Honest source label, rendered next to the time. */
  label: 'Service' | 'Starts' | 'First item'
  /** 'HH:mm' 24-hour — back-planning math runs on this. */
  hhmm: string
  /** 12-hour display, e.g. '3:00 PM'. */
  display: string
}

const ANCHOR_LABEL: Record<JobStripTime['source'], AnchorTime['label']> = {
  service: 'Service',
  hours: 'Starts',
  itinerary: 'First item',
}

/**
 * Earliest itinerary entry WITH a valid time. groupItineraryByDay sorts items
 * lexicographically by start_time, so a blank start_time (creatable via the
 * itinerary edit path) sorts FIRST — inspecting only [0][0] would let it mask
 * later timed entries and falsely force "Time TBD".
 */
function firstTimedItineraryStart(itinerary: ItineraryDay[]): string | null {
  for (const day of itinerary) {
    for (const item of day.items) {
      if (item.start_time && formatClockTime(item.start_time) !== null) return item.start_time
    }
  }
  return null
}

export function resolveAnchorTime(input: {
  /** OpsRequirements.service_start — 'YYYY-MM-DDTHH:mm' (datetime-local shape). */
  serviceStart?: string
  /** Event.hours.start — 'HH:mm'. */
  hoursStart?: string
  itinerary: ItineraryDay[]
}): AnchorTime | null {
  const resolved = resolveJobTime({
    serviceStart: input.serviceStart,
    hoursStart: input.hoursStart,
    firstItineraryTime: firstTimedItineraryStart(input.itinerary),
  })
  if (!resolved) return null
  const display = formatClockTime(resolved.hhmm)
  if (!display) return null // unreachable: resolveJobTime only returns clock-valid times
  return { label: ANCHOR_LABEL[resolved.source], hhmm: resolved.hhmm, display }
}

export const BUFFER_ASSUMPTION_LABEL = `assumes ${PACK_MINUTES}m pack · ${DRIVE_MINUTES}m drive`

export interface BackPlan {
  packBy: string   // 12-hour display
  leaveBy: string  // 12-hour display
}

/** Runsheet naming for the shared back-plan math — see backPlanChips above. */
export function backPlanFromAnchor(hhmm: string): BackPlan | null {
  return backPlanChips(hhmm)
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Day-of phases the run sheet carries; prep/load-out belong to the ops plan + load-out surface. */
export const RUN_SHEET_CHECKLIST_PHASES = ['setup', 'service-close'] as const

/** Call-sheet discipline: past this many timeline entries, collapse behind "Show all N". */
export const TIMELINE_FOLD = 15
