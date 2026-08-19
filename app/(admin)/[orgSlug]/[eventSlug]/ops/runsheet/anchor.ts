// Pure time logic for the run sheet — shared by the live page, the print
// route, and RunSheetClient (no directives, so it imports cleanly on both
// sides of the server/client boundary).
//
// B7 (time-source honesty): the anchor time always says WHERE it came from.
// Precedence: ops-plan service start ("Service 3:00 PM") → event booking hours
// ("Starts 2:00 PM") → earliest itinerary item ("First item 1:30 PM") →
// no anchor at all ("Time TBD" — never a fabricated time).

import { formatTime } from '@/lib/itinerary'
import type { ItineraryDay } from '@/lib/itinerary'

export interface AnchorTime {
  /** Honest source label, rendered next to the time. */
  label: 'Service' | 'Starts' | 'First item'
  /** 'HH:mm' 24-hour — back-planning math runs on this. */
  hhmm: string
  /** 12-hour display, e.g. '3:00 PM'. */
  display: string
}

const HHMM = /^\d{2}:\d{2}$/

export function resolveAnchorTime(input: {
  /** OpsRequirements.service_start — 'YYYY-MM-DDTHH:mm' (datetime-local shape). */
  serviceStart?: string
  /** Event.hours.start — 'HH:mm'. */
  hoursStart?: string
  itinerary: ItineraryDay[]
}): AnchorTime | null {
  const service = input.serviceStart?.slice(11, 16)
  if (service && HHMM.test(service)) {
    return { label: 'Service', hhmm: service, display: formatTime(service) }
  }
  if (input.hoursStart && HHMM.test(input.hoursStart)) {
    return { label: 'Starts', hhmm: input.hoursStart, display: formatTime(input.hoursStart) }
  }
  const first = input.itinerary[0]?.items[0]?.start_time
  if (first && HHMM.test(first)) {
    return { label: 'First item', hhmm: first, display: formatTime(first) }
  }
  return null
}

// Fixed default buffers (accepted ratchet): zero storage, labeled as
// assumptions wherever the chips render. Configurable buffers are named
// increment-2 work.
export const PACK_MINUTES = 45
export const DRIVE_MINUTES = 30
export const BUFFER_ASSUMPTION_LABEL = `assumes ${PACK_MINUTES}m pack · ${DRIVE_MINUTES}m drive`

export interface BackPlan {
  packBy: string   // 12-hour display
  leaveBy: string  // 12-hour display
}

/**
 * Back-planned "Pack by / Leave by" from the anchor minus the fixed buffers.
 * Returns null when the anchor sits inside the buffer window after midnight —
 * a "Pack by 11:40 PM" the night before would be a claim about the wrong day.
 */
export function backPlanFromAnchor(hhmm: string): BackPlan | null {
  if (!HHMM.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  const anchor = h * 60 + m
  if (anchor < PACK_MINUTES + DRIVE_MINUTES) return null
  const leave = anchor - DRIVE_MINUTES
  const pack = leave - PACK_MINUTES
  const toHhmm = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  return { packBy: formatTime(toHhmm(pack)), leaveBy: formatTime(toHhmm(leave)) }
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Day-of phases the run sheet carries; prep/load-out belong to the ops plan + load-out surface. */
export const RUN_SHEET_CHECKLIST_PHASES = ['setup', 'service-close'] as const

/** Call-sheet discipline: past this many timeline entries, collapse behind "Show all N". */
export const TIMELINE_FOLD = 15
