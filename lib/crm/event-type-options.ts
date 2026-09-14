import type { EventTypeProfile, Lead, Org } from '@/lib/types'

/*
 * Server-side helpers around the org's event-type profiles and lead history
 * for the create surfaces (New Opportunity inc 1 / event types inc 1).
 *
 * `buildEventTypeOptions` — the old cap-8 profiles-plus-history CHIP
 * vocabulary — lived here until the chip row was replaced by the shared
 * EventTypeSelect dropdown (profiles only). The pickers list profiles alone;
 * historical free-text vocabulary surfaces through adopt-from-history on the
 * Settings → Event types page instead.
 */

/**
 * The RAW profile vocabulary (contract C5b's `eventTypeProfileNames`) —
 * ACTIVE profiles only (inc 1), trimmed, original casing, in profile order,
 * blanks dropped. The "is this a CONFIGURED event type?" key: an archived
 * profile is NOT configured for new work, so it is excluded here.
 */
export function eventTypeProfileNames(profiles: Org['event_type_profiles']): string[] {
  return (profiles ?? [])
    .filter((p) => !p.archived)
    .map((p) => p.name.trim())
    .filter((n) => n !== '')
}

/**
 * The full ACTIVE profile objects in display (array) order — what the pickers
 * and the inline-create popover consume when they need ids + policy flags, not
 * just name strings (event types inc 1). Entries are returned verbatim; legacy
 * entries without an `id` are included (they are still real, active types).
 */
export function activeEventTypeProfiles(
  profiles: Org['event_type_profiles']
): EventTypeProfile[] {
  return (profiles ?? []).filter((p) => !p.archived)
}

/**
 * customer_id → total opportunity count (contract C5b's `pastJobCounts`),
 * feeding the caller-recognition hint's "{n} past jobs". Counts EVERY lead in
 * the set it is given — open or closed; a past job is a past job however it
 * ended. The pipeline page feeds the whole org's leads; the cockpit page pins
 * one customer and passes `{ [customerId]: opportunities.length }` directly.
 */
export function pastJobCounts(leads: Array<Pick<Lead, 'customer_id'>>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const l of leads) {
    if (!l.customer_id) continue
    counts[l.customer_id] = (counts[l.customer_id] ?? 0) + 1
  }
  return counts
}
