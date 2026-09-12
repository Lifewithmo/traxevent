import type { Lead, Org } from '@/lib/types'

/**
 * Which capacity kinds a lead consumes, 0/1 each. The single source of truth for
 * the "does this booking need a serving unit / a room?" question, replacing the
 * inline `delivery_mode === 'onsite'` rules that were scattered across the
 * capacity engines (`computeCapacity`, `computeClashes`, `forecastByMonth`,
 * `buildSchedule`).
 */
export interface LeadRequirement {
  mobile: boolean
  venue: boolean
}

type EventTypeProfile = NonNullable<Org['event_type_profiles']>[number]

/**
 * The keystone: what a lead requires of the org's capacity resources.
 *
 * 1. If the org has an `event_type_profiles` entry whose `name` matches the
 *    lead's `event_type` (both trimmed + lower-cased; last match wins on dupes),
 *    that profile is AUTHORITATIVE — `{ mobile: needsMobile, venue: needsVenue }`.
 *    A profile's `needsVenue` therefore overrides `delivery_mode` (a room can be
 *    required for an offsite lead, or skipped for an onsite one).
 * 2. Otherwise (no profiles, no event_type, or no match) the default rule —
 *    exactly today's capacity-mode behavior: a mobile unit ALWAYS, and a venue
 *    only when the lead is on-site. This is the non-negotiable backstop: with no
 *    profiles configured, every engine output is byte-for-byte unchanged.
 *
 * Pure — no I/O; both inputs are already in memory at every call site.
 */
export function leadRequirement(
  lead: Pick<Lead, 'event_type' | 'delivery_mode'>,
  org: Pick<Org, 'event_type_profiles'>,
): LeadRequirement {
  const profiles = org.event_type_profiles
  const key = lead.event_type?.trim().toLowerCase()
  if (profiles && profiles.length > 0 && key) {
    let matched: EventTypeProfile | undefined
    for (const p of profiles) {
      if (p.name.trim().toLowerCase() === key) matched = p // last match wins
    }
    if (matched) return { mobile: matched.needsMobile, venue: matched.needsVenue }
  }
  return { mobile: true, venue: lead.delivery_mode === 'onsite' }
}
