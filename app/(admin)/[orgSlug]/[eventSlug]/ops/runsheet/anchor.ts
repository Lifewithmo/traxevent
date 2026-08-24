// Runsheet-specific glue over the shared job-time/back-plan helpers — used by
// the live page, the print route, and RunSheetClient (no directives, so it
// imports cleanly on both sides of the server/client boundary).
//
// B7 (time-source honesty): the anchor time always says WHERE it came from.
// Precedence: ops-plan service start ("Service 3:00 PM") → event booking hours
// ("Starts 2:00 PM") → earliest TIMED itinerary item ("First item 1:30 PM") →
// no anchor at all ("Time TBD" — never a fabricated time).

import type { ItineraryDay } from '@/lib/itinerary'
// Shared job-time/back-plan implementations live in lib/event-ui (client-safe
// pure vocab; lib/event-spine re-exports them server-side but value-imports
// firebase-admin, so THIS module — bundled into the 'use client' RunSheetClient —
// must import from event-ui). PACK/DRIVE re-exported for the anchor tests.
import {
  DRIVE_MINUTES,
  PACK_MINUTES,
  backPlanChips,
  bufferAssumptionLabel,
  formatClockTime,
  resolveJobTime,
  type JobStripTime,
  type OpsBuffers,
} from '@/lib/event-ui'

export { DRIVE_MINUTES, PACK_MINUTES, bufferAssumptionLabel, type OpsBuffers }

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

export interface BackPlan {
  packBy: string   // 12-hour display
  leaveBy: string  // 12-hour display
}

/**
 * Runsheet naming for the shared back-plan math — see backPlanChips above.
 * `buffers` = the org's ops_buffers (inc-2 S4.3); absent fields fall back to
 * the PACK/DRIVE constants inside resolveBuffers, so constant behavior is the
 * default everywhere. Caption the chips with bufferAssumptionLabel(buffers)
 * (re-exported above) so the label can never disagree with the math.
 */
export function backPlanFromAnchor(hhmm: string, buffers?: OpsBuffers): BackPlan | null {
  return backPlanChips(hhmm, buffers)
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Day-of phases the run sheet carries; prep/load-out belong to the ops plan + load-out surface. */
export const RUN_SHEET_CHECKLIST_PHASES = ['setup', 'service-close'] as const

/** Call-sheet discipline: past this many timeline entries, collapse behind "Show all N". */
export const TIMELINE_FOLD = 15
