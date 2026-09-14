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
 * 1. If the lead carries an `event_type_id` that references a profile, that
 *    profile is AUTHORITATIVE — archived included, so booked history keeps its
 *    policy through an archive. A stale id (profile deleted/merged away before
 *    this rule existed) simply falls through to the name match.
 * 2. Else, if a profile `name` matches the lead's `event_type` (both trimmed +
 *    lower-cased; last match wins on dupes; archived included), that profile is
 *    authoritative — `{ mobile: needsMobile, venue: needsVenue }`. A profile's
 *    `needsVenue` therefore overrides `delivery_mode` (a room can be required
 *    for an offsite lead, or skipped for an onsite one).
 * 3. Otherwise (no profiles, no event_type, or no match) the default rule —
 *    exactly today's capacity-mode behavior: a mobile unit ALWAYS, and a venue
 *    only when the lead is on-site. This is the non-negotiable backstop: with no
 *    profiles configured, every engine output is byte-for-byte unchanged.
 *
 * Pure — no I/O; both inputs are already in memory at every call site.
 */
export function leadRequirement(
  lead: Pick<Lead, 'event_type' | 'delivery_mode' | 'event_type_id'>,
  org: Pick<Org, 'event_type_profiles'>,
): LeadRequirement {
  const profiles = org.event_type_profiles
  if (profiles && profiles.length > 0) {
    if (lead.event_type_id) {
      const byId = profiles.find((p) => p.id === lead.event_type_id)
      if (byId) return { mobile: byId.needsMobile, venue: byId.needsVenue }
    }
    const key = lead.event_type?.trim().toLowerCase()
    if (key) {
      let matched: EventTypeProfile | undefined
      for (const p of profiles) {
        if (p.name.trim().toLowerCase() === key) matched = p // last match wins
      }
      if (matched) return { mobile: matched.needsMobile, venue: matched.needsVenue }
    }
  }
  return { mobile: true, venue: lead.delivery_mode === 'onsite' }
}
