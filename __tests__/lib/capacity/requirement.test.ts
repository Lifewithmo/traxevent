import { describe, it, expect } from 'vitest'
import { leadRequirement } from '@/lib/capacity/requirement'
import type { Lead, Org } from '@/lib/types'

function lead(over: Partial<Lead>): Lead {
  return {
    id: over.id ?? 'L1',
    name: over.name ?? 'Lead',
    stage: over.stage ?? 'inquiry',
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('leadRequirement — default rule (no profiles)', () => {
  it('needs a mobile unit always and a venue only when on-site', () => {
    expect(leadRequirement(lead({ delivery_mode: 'onsite' }), {})).toEqual({ mobile: true, venue: true })
    expect(leadRequirement(lead({ delivery_mode: 'offsite' }), {})).toEqual({ mobile: true, venue: false })
  })

  it('treats an absent delivery_mode as offsite (no venue)', () => {
    expect(leadRequirement(lead({}), {})).toEqual({ mobile: true, venue: false })
  })

  it('ignores event_type when the org has no profiles', () => {
    const l = lead({ event_type: 'Wedding', delivery_mode: 'onsite' })
    expect(leadRequirement(l, {})).toEqual({ mobile: true, venue: true })
    expect(leadRequirement(l, { event_type_profiles: undefined })).toEqual({ mobile: true, venue: true })
  })
})

describe('leadRequirement — profile match', () => {
  const profiles: Org['event_type_profiles'] = [
    { name: 'Wedding', needsMobile: true, needsVenue: true },
    { name: 'Photo package', needsMobile: false, needsVenue: false },
    { name: 'Room rental', needsMobile: false, needsVenue: true },
  ]

  it('a matched profile is authoritative for BOTH kinds', () => {
    // Photo package needs neither — even though nothing about delivery_mode says so.
    expect(leadRequirement(lead({ event_type: 'Photo package', delivery_mode: 'onsite' }), { event_type_profiles: profiles }))
      .toEqual({ mobile: false, venue: false })
  })

  it('a profile venue need wins over delivery_mode (venue counted though OFFSITE)', () => {
    expect(leadRequirement(lead({ event_type: 'Room rental', delivery_mode: 'offsite' }), { event_type_profiles: profiles }))
      .toEqual({ mobile: false, venue: true })
  })

  it('matches case-insensitively and trimmed on both sides', () => {
    expect(leadRequirement(lead({ event_type: '  wEdDiNg ' }), { event_type_profiles: profiles }))
      .toEqual({ mobile: true, venue: true })
    const spacedProfiles: Org['event_type_profiles'] = [{ name: '  Gala  ', needsMobile: false, needsVenue: true }]
    expect(leadRequirement(lead({ event_type: 'gala' }), { event_type_profiles: spacedProfiles }))
      .toEqual({ mobile: false, venue: true })
  })

  it('last matching profile wins on duplicate names', () => {
    const dupes: Org['event_type_profiles'] = [
      { name: 'Party', needsMobile: true, needsVenue: false },
      { name: 'party', needsMobile: false, needsVenue: true },
    ]
    expect(leadRequirement(lead({ event_type: 'Party' }), { event_type_profiles: dupes }))
      .toEqual({ mobile: false, venue: true })
  })

  it('falls back to the default rule for an unmatched event_type', () => {
    expect(leadRequirement(lead({ event_type: 'Bar mitzvah', delivery_mode: 'onsite' }), { event_type_profiles: profiles }))
      .toEqual({ mobile: true, venue: true })
  })

  it('falls back to the default rule for an absent event_type even with profiles', () => {
    expect(leadRequirement(lead({ delivery_mode: 'offsite' }), { event_type_profiles: profiles }))
      .toEqual({ mobile: true, venue: false })
  })
})

/*
  ID-FIRST MATCHING (event types inc 1, spec §3): ① `event_type_id` → profile by
  id (archived included — history keeps its policy); ② name match, the exact
  pre-existing trim+lowercase semantics (archived included); ③ default rule.
  The no-profiles backstop above must stay byte-for-byte intact.
*/
describe('leadRequirement — id-first matching', () => {
  const profiles: Org['event_type_profiles'] = [
    { id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true },
    { id: 'p-photo', name: 'Photo package', needsMobile: false, needsVenue: false },
  ]

  it('an id match wins over a conflicting name match', () => {
    // The lead SAYS "Photo package" but REFERENCES the Wedding profile — the id
    // is the authoritative join (a rename must never re-route history by name).
    expect(leadRequirement(
      lead({ event_type: 'Photo package', event_type_id: 'p-wed' }),
      { event_type_profiles: profiles },
    )).toEqual({ mobile: true, venue: true })
  })

  it('an id match resolves an ARCHIVED profile — booked history keeps its policy', () => {
    const withArchived: Org['event_type_profiles'] = [
      { id: 'p-gala', name: 'Gala', needsMobile: false, needsVenue: true, archived: true },
    ]
    expect(leadRequirement(
      lead({ event_type: 'Gala', event_type_id: 'p-gala', delivery_mode: 'offsite' }),
      { event_type_profiles: withArchived },
    )).toEqual({ mobile: false, venue: true })
  })

  it('an id match resolves an ARCHIVED profile even when the free-text type no longer matches (renamed before archive)', () => {
    // Isolates the id branch: if id matching wrongly skipped archived profiles,
    // this lead has no name match to fall back on and would hit the default
    // rule ({mobile: true, venue: false} offsite) instead.
    const withArchived: Org['event_type_profiles'] = [
      { id: 'p-gala', name: 'Gala', needsMobile: false, needsVenue: true, archived: true },
    ]
    expect(leadRequirement(
      lead({ event_type: 'Something else entirely', event_type_id: 'p-gala', delivery_mode: 'offsite' }),
      { event_type_profiles: withArchived },
    )).toEqual({ mobile: false, venue: true })
  })

  it('a stale event_type_id (no such profile) falls back to name matching', () => {
    expect(leadRequirement(
      lead({ event_type: 'Photo package', event_type_id: 'gone-id' }),
      { event_type_profiles: profiles },
    )).toEqual({ mobile: false, venue: false })
  })

  it('a stale id with no name match falls all the way to the default rule', () => {
    expect(leadRequirement(
      lead({ event_type: 'Bar mitzvah', event_type_id: 'gone-id', delivery_mode: 'onsite' }),
      { event_type_profiles: profiles },
    )).toEqual({ mobile: true, venue: true })
  })

  it('name matching still resolves an archived profile (lead has no id)', () => {
    const withArchived: Org['event_type_profiles'] = [
      { id: 'p-gala', name: 'Gala', needsMobile: false, needsVenue: true, archived: true },
    ]
    expect(leadRequirement(lead({ event_type: 'gala' }), { event_type_profiles: withArchived }))
      .toEqual({ mobile: false, venue: true })
  })

  it('an event_type_id with NO profiles configured keeps the default-rule backstop', () => {
    expect(leadRequirement(lead({ event_type_id: 'p-wed', delivery_mode: 'onsite' }), {}))
      .toEqual({ mobile: true, venue: true })
    expect(leadRequirement(lead({ event_type_id: 'p-wed' }), { event_type_profiles: [] }))
      .toEqual({ mobile: true, venue: false })
  })
})
