import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTypeProfile, Lead } from '@/lib/types'

/*
  Event types inc 1 (spec §4) — the lifecycle cores. Firestore is mocked to the
  chainable-stub pattern from __tests__/actions/capacity-config.test.ts, widened
  the departments-test way for the pieces the cores actually touch: the org doc
  (get/update), the leads collection (get → docs with .ref + .data()), and the
  WriteBatch used for the ≤500-per-batch lead backfills.
*/

const orgDocGetSpy = vi.hoisted(() => vi.fn())
const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadsGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const batchUpdateSpy = vi.hoisted(() => vi.fn())
const batchCommitSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const batchFactorySpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const leadsCol = { get: leadsGetSpy }
  const orgDoc = {
    get: orgDocGetSpy,
    update: orgDocUpdateSpy,
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'leads' ? leadsCol : {})),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      batch: batchFactorySpy.mockImplementation(() => ({ update: batchUpdateSpy, commit: batchCommitSpy })),
    },
  }
})

import {
  computeEventTypeUsage,
  createEventTypeProfileCore,
  renameEventTypeProfileCore,
  mergeEventTypeProfilesCore,
  deleteEventTypeProfileCore,
  setEventTypeProfileArchivedCore,
  adoptEventTypesFromHistoryCore,
} from '@/lib/crm/event-type-admin'

const HEX16 = /^[0-9a-f]{16}$/

function lead(over: Partial<Lead> & { id: string }): Lead {
  return {
    name: 'Lead',
    stage: 'inquiry',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Lead
}

/** A query-snapshot doc: `.ref` is tagged with the lead id so batch assertions
 *  can tell exactly which leads were rewritten. */
function leadDoc(l: Lead) {
  return { ref: { __lead: l.id }, data: () => l }
}

function mockOrg(profiles: EventTypeProfile[] | undefined) {
  orgDocGetSpy.mockResolvedValue({
    exists: true,
    data: () => ({ id: 'org-1', name: 'Org', ...(profiles ? { event_type_profiles: profiles } : {}) }),
  })
}

function mockLeads(leads: Lead[]) {
  leadsGetSpy.mockResolvedValue({ docs: leads.map(leadDoc) })
}

const WEDDING: EventTypeProfile = { id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true }
const CORP: EventTypeProfile = { id: 'p-corp', name: 'Corporate', needsMobile: true, needsVenue: false }

beforeEach(() => {
  vi.clearAllMocks()
  batchFactorySpy.mockImplementation(() => ({ update: batchUpdateSpy, commit: batchCommitSpy }))
  mockLeads([])
})

describe('computeEventTypeUsage (pure)', () => {
  it('counts id-referenced leads to their profile even when the name disagrees (post-rename)', () => {
    const leads = [
      lead({ id: 'l1', event_type: 'Old wedding name', event_type_id: 'p-wed' }),
      lead({ id: 'l2', event_type: 'Wedding' }), // no id — name match
      lead({ id: 'l3', event_type: 'Corporate', event_type_id: 'p-corp' }),
    ]
    const usage = computeEventTypeUsage(leads, [WEDDING, CORP])
    expect(usage.byProfileId).toEqual({ 'p-wed': 2, 'p-corp': 1 })
    expect(usage.unadopted).toEqual([])
  })

  it('mirrors leadRequirement: a stale id falls back to name matching', () => {
    const leads = [lead({ id: 'l1', event_type: '  wedding ', event_type_id: 'gone-id' })]
    const usage = computeEventTypeUsage(leads, [WEDDING])
    expect(usage.byProfileId).toEqual({ 'p-wed': 1 })
    expect(usage.unadopted).toEqual([])
  })

  it('every id-bearing profile appears in byProfileId, zero-usage ones included', () => {
    const usage = computeEventTypeUsage([], [WEDDING, CORP])
    expect(usage.byProfileId).toEqual({ 'p-wed': 0, 'p-corp': 0 })
  })

  it('groups unadopted names case-insensitively, displaying the most frequent spelling', () => {
    const leads = [
      lead({ id: 'l1', event_type: 'corporate offsite' }),
      lead({ id: 'l2', event_type: 'Corporate Offsite' }),
      lead({ id: 'l3', event_type: 'Corporate Offsite' }),
      lead({ id: 'l4', event_type: 'Gala' }),
    ]
    const usage = computeEventTypeUsage(leads, [WEDDING])
    expect(usage.unadopted).toEqual([
      { name: 'Corporate Offsite', count: 3, onsiteMajority: false },
      { name: 'Gala', count: 1, onsiteMajority: false },
    ])
  })

  it('keeps the first-seen spelling on a spelling tie, and sorts groups by count desc', () => {
    const leads = [
      lead({ id: 'l1', event_type: 'brunch' }),  // spelling tie 1–1: first-seen 'brunch' wins
      lead({ id: 'l2', event_type: 'Gala' }),
      lead({ id: 'l3', event_type: 'Gala' }),
      lead({ id: 'l4', event_type: 'Gala' }),
      lead({ id: 'l5', event_type: 'Brunch' }),
    ]
    const usage = computeEventTypeUsage(leads, [])
    expect(usage.unadopted).toEqual([
      { name: 'Gala', count: 3, onsiteMajority: false },
      { name: 'brunch', count: 2, onsiteMajority: false },
    ])
  })

  it('a count tie between groups keeps first-seen group order (stable, deterministic)', () => {
    const leads = [
      lead({ id: 'l1', event_type: 'Brunch' }),
      lead({ id: 'l2', event_type: 'Gala' }),
      lead({ id: 'l3', event_type: 'Gala' }),
      lead({ id: 'l4', event_type: 'Brunch' }),
    ]
    expect(computeEventTypeUsage(leads, []).unadopted).toEqual([
      { name: 'Brunch', count: 2, onsiteMajority: false },
      { name: 'Gala', count: 2, onsiteMajority: false },
    ])
  })

  it('onsiteMajority is a STRICT majority of the group being delivery_mode onsite', () => {
    const leads = [
      lead({ id: 'l1', event_type: 'Tasting', delivery_mode: 'onsite' }),
      lead({ id: 'l2', event_type: 'Tasting', delivery_mode: 'onsite' }),
      lead({ id: 'l3', event_type: 'Tasting', delivery_mode: 'offsite' }),
      lead({ id: 'l4', event_type: 'Popup', delivery_mode: 'onsite' }),
      lead({ id: 'l5', event_type: 'Popup' }), // absent = offsite; 1 of 2 is NOT a majority
    ]
    const usage = computeEventTypeUsage(leads, [])
    expect(usage.unadopted).toEqual([
      { name: 'Tasting', count: 3, onsiteMajority: true },
      { name: 'Popup', count: 2, onsiteMajority: false },
    ])
  })

  it('ignores leads with no or blank event_type and no resolvable id', () => {
    const leads = [
      lead({ id: 'l1' }),
      lead({ id: 'l2', event_type: '   ' }),
      lead({ id: 'l3', event_type_id: 'gone-id' }),
    ]
    expect(computeEventTypeUsage(leads, [WEDDING])).toEqual({
      byProfileId: { 'p-wed': 0 },
      unadopted: [],
    })
  })
})

describe('createEventTypeProfileCore', () => {
  it('appends a new profile with a 16-hex id, trimmed name, coerced booleans', async () => {
    mockOrg([WEDDING])
    const created = await createEventTypeProfileCore('org-1', {
      name: '  Festival ', needsMobile: 1 as unknown as boolean, needsVenue: 0 as unknown as boolean,
    })
    expect(created).toEqual({
      id: expect.stringMatching(HEX16), name: 'Festival', needsMobile: true, needsVenue: false,
    })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      event_type_profiles: [WEDDING, created],
    })
  })

  it('is idempotent: a case-insensitive name match returns the existing profile without writing', async () => {
    mockOrg([WEDDING])
    const got = await createEventTypeProfileCore('org-1', { name: ' wedding ', needsMobile: false, needsVenue: false })
    expect(got).toEqual(WEDDING)
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('unarchives an archived same-name profile (create = restore)', async () => {
    mockOrg([{ ...CORP, archived: true }])
    const got = await createEventTypeProfileCore('org-1', { name: 'Corporate', needsMobile: true, needsVenue: false })
    expect(got).toEqual(CORP)
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ event_type_profiles: [CORP] })
  })

  it('assigns an id to a matched legacy id-less entry and persists it', async () => {
    mockOrg([{ name: 'Wedding', needsMobile: true, needsVenue: true }])
    const got = await createEventTypeProfileCore('org-1', { name: 'Wedding', needsMobile: true, needsVenue: true })
    expect(got.id).toMatch(HEX16)
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      event_type_profiles: [{ id: got.id, name: 'Wedding', needsMobile: true, needsVenue: true }],
    })
  })

  it('rejects a blank name and does not write', async () => {
    mockOrg([])
    await expect(
      createEventTypeProfileCore('org-1', { name: '   ', needsMobile: true, needsVenue: false })
    ).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('renameEventTypeProfileCore', () => {
  it('updates the entry, then backfills exactly the matching leads with {event_type_id, event_type}', async () => {
    mockOrg([WEDDING, CORP])
    mockLeads([
      lead({ id: 'l1', event_type: 'Something old', event_type_id: 'p-wed' }), // id match
      lead({ id: 'l2', event_type: ' wedding ' }),                             // no-id name match on OLD name
      lead({ id: 'l3', event_type: 'Wedding', event_type_id: 'p-corp' }),      // OTHER id — untouched
      lead({ id: 'l4', event_type: 'Gala' }),                                  // different name — untouched
    ])
    const res = await renameEventTypeProfileCore('org-1', 'p-wed', ' Weddings ')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      event_type_profiles: [{ ...WEDDING, name: 'Weddings' }, CORP],
    })
    expect(res).toEqual({ updated: 2 })
    expect(batchUpdateSpy).toHaveBeenCalledTimes(2)
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l1' }, { event_type_id: 'p-wed', event_type: 'Weddings' })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l2' }, { event_type_id: 'p-wed', event_type: 'Weddings' })
    expect(batchCommitSpy).toHaveBeenCalledTimes(1)
  })

  it('with no matching leads: renames the entry, commits no batch, returns {updated: 0}', async () => {
    mockOrg([WEDDING])
    mockLeads([lead({ id: 'l1', event_type: 'Gala' })])
    expect(await renameEventTypeProfileCore('org-1', 'p-wed', 'Weddings')).toEqual({ updated: 0 })
    expect(batchCommitSpy).not.toHaveBeenCalled()
  })

  it('splits the backfill into batches of at most 500', async () => {
    mockOrg([WEDDING])
    mockLeads(Array.from({ length: 501 }, (_, i) => lead({ id: `l${i}`, event_type_id: 'p-wed' })))
    const res = await renameEventTypeProfileCore('org-1', 'p-wed', 'Weddings')
    expect(res).toEqual({ updated: 501 })
    expect(batchUpdateSpy).toHaveBeenCalledTimes(501)
    expect(batchCommitSpy).toHaveBeenCalledTimes(2)
  })

  it('rejects an unknown id, a blank name, and a rename onto another profile\'s name', async () => {
    mockOrg([WEDDING, CORP])
    await expect(renameEventTypeProfileCore('org-1', 'nope', 'X')).rejects.toThrow('Event type not found')
    await expect(renameEventTypeProfileCore('org-1', 'p-wed', '  ')).rejects.toThrow()
    await expect(renameEventTypeProfileCore('org-1', 'p-wed', ' corporate ')).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
    expect(batchCommitSpy).not.toHaveBeenCalled()
  })

  it('allows a pure casing rename of the same profile (not a collision with itself)', async () => {
    mockOrg([WEDDING])
    mockLeads([lead({ id: 'l1', event_type: 'wedding' })])
    expect(await renameEventTypeProfileCore('org-1', 'p-wed', 'WEDDING')).toEqual({ updated: 1 })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l1' }, { event_type_id: 'p-wed', event_type: 'WEDDING' })
  })
})

describe('mergeEventTypeProfilesCore', () => {
  it('re-points matching leads to the target and removes the source entry', async () => {
    const offsite: EventTypeProfile = { id: 'p-off', name: 'Corporate offsite', needsMobile: true, needsVenue: false }
    mockOrg([WEDDING, CORP, offsite])
    mockLeads([
      lead({ id: 'l1', event_type: 'Corporate offsite', event_type_id: 'p-off' }), // id match
      lead({ id: 'l2', event_type: 'corporate offsite' }),                          // no-id name match
      lead({ id: 'l3', event_type: 'Corporate offsite', event_type_id: 'p-wed' }),  // other id — untouched
      lead({ id: 'l4', event_type: 'Corporate', event_type_id: 'p-corp' }),         // already the target
    ])
    const res = await mergeEventTypeProfilesCore('org-1', 'p-off', 'p-corp')
    expect(res).toEqual({ updated: 2 })
    expect(batchUpdateSpy).toHaveBeenCalledTimes(2)
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l1' }, { event_type_id: 'p-corp', event_type: 'Corporate' })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l2' }, { event_type_id: 'p-corp', event_type: 'Corporate' })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ event_type_profiles: [WEDDING, CORP] })
  })

  it('rejects unknown ids and merging a profile into itself', async () => {
    mockOrg([WEDDING, CORP])
    await expect(mergeEventTypeProfilesCore('org-1', 'p-wed', 'p-wed')).rejects.toThrow()
    await expect(mergeEventTypeProfilesCore('org-1', 'nope', 'p-corp')).rejects.toThrow('Event type not found')
    await expect(mergeEventTypeProfilesCore('org-1', 'p-wed', 'nope')).rejects.toThrow('Event type not found')
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
    expect(batchCommitSpy).not.toHaveBeenCalled()
  })
})

describe('deleteEventTypeProfileCore', () => {
  it('refuses with the usage count when the profile is in use (guard-as-return-value)', async () => {
    mockOrg([WEDDING])
    mockLeads([
      lead({ id: 'l1', event_type_id: 'p-wed' }),
      lead({ id: 'l2', event_type: 'wedding' }),
      lead({ id: 'l3', event_type: 'Wedding', event_type_id: 'gone-id' }), // stale id → name fallback counts
      lead({ id: 'l4', event_type: 'Gala' }),
    ])
    expect(await deleteEventTypeProfileCore('org-1', 'p-wed')).toEqual({ ok: false, usage: 3 })
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('removes the entry at server-verified zero usage', async () => {
    mockOrg([WEDDING, CORP])
    mockLeads([lead({ id: 'l1', event_type: 'Gala' })])
    expect(await deleteEventTypeProfileCore('org-1', 'p-wed')).toEqual({ ok: true })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ event_type_profiles: [CORP] })
  })

  it('rejects an unknown id', async () => {
    mockOrg([WEDDING])
    await expect(deleteEventTypeProfileCore('org-1', 'nope')).rejects.toThrow('Event type not found')
  })
})

describe('setEventTypeProfileArchivedCore', () => {
  it('archives an entry in place', async () => {
    mockOrg([WEDDING, CORP])
    await setEventTypeProfileArchivedCore('org-1', 'p-corp', true)
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      event_type_profiles: [WEDDING, { ...CORP, archived: true }],
    })
  })

  it('restore drops the archived flag entirely (clean doc shape)', async () => {
    mockOrg([{ ...CORP, archived: true }])
    await setEventTypeProfileArchivedCore('org-1', 'p-corp', false)
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ event_type_profiles: [CORP] })
  })

  it('rejects an unknown id', async () => {
    mockOrg([WEDDING])
    await expect(setEventTypeProfileArchivedCore('org-1', 'nope', true)).rejects.toThrow('Event type not found')
  })
})

describe('adoptEventTypesFromHistoryCore', () => {
  it('creates the entries with ids and backfills event_type_id onto exact-matching no-id leads', async () => {
    mockOrg([WEDDING])
    mockLeads([
      lead({ id: 'l1', event_type: 'corporate offsite' }),
      lead({ id: 'l2', event_type: 'Corporate Offsite ' }),
      lead({ id: 'l3', event_type: 'Gala', event_type_id: 'stale' }), // has an id — never touched
      lead({ id: 'l4', event_type: 'Gala' }),
      lead({ id: 'l5', event_type: 'Brunch' }),                       // not adopted this round
    ])
    const res = await adoptEventTypesFromHistoryCore('org-1', [
      { name: 'Corporate Offsite', needsMobile: true, needsVenue: false },
      { name: 'Gala', needsMobile: true, needsVenue: true },
    ])
    expect(res).toEqual({ created: 2, adopted: 3 })

    const written = orgDocUpdateSpy.mock.calls[0][0].event_type_profiles as EventTypeProfile[]
    expect(written).toHaveLength(3)
    expect(written[0]).toEqual(WEDDING)
    expect(written[1]).toEqual({
      id: expect.stringMatching(HEX16), name: 'Corporate Offsite', needsMobile: true, needsVenue: false,
    })
    expect(written[2]).toEqual({
      id: expect.stringMatching(HEX16), name: 'Gala', needsMobile: true, needsVenue: true,
    })

    // The backfill stamps the id ONLY — a lead's own free-text spelling is a
    // record; adopt classifies history, it does not rewrite it.
    expect(batchUpdateSpy).toHaveBeenCalledTimes(3)
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l1' }, { event_type_id: written[1].id })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l2' }, { event_type_id: written[1].id })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l4' }, { event_type_id: written[2].id })
  })

  it('is idempotent: a re-run creates nothing, adopts nothing, writes nothing', async () => {
    const gala: EventTypeProfile = { id: 'p-gala', name: 'Gala', needsMobile: true, needsVenue: true }
    mockOrg([WEDDING, gala])
    mockLeads([lead({ id: 'l1', event_type: 'Gala', event_type_id: 'p-gala' })])
    const res = await adoptEventTypesFromHistoryCore('org-1', [
      { name: 'gala', needsMobile: false, needsVenue: false },
    ])
    expect(res).toEqual({ created: 0, adopted: 0 })
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
    expect(batchCommitSpy).not.toHaveBeenCalled()
  })

  it('matching an existing ARCHIVED profile revives it and still backfills its leads', async () => {
    mockOrg([{ ...CORP, archived: true }])
    mockLeads([lead({ id: 'l1', event_type: 'corporate' })])
    const res = await adoptEventTypesFromHistoryCore('org-1', [
      { name: 'Corporate', needsMobile: false, needsVenue: false },
    ])
    expect(res).toEqual({ created: 0, adopted: 1 })
    // Revived with its ORIGINAL policy — adopt never overwrites configured flags.
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ event_type_profiles: [CORP] })
    expect(batchUpdateSpy).toHaveBeenCalledWith({ __lead: 'l1' }, { event_type_id: 'p-corp' })
  })

  it('rejects a blank entry name before writing anything', async () => {
    mockOrg([])
    await expect(
      adoptEventTypesFromHistoryCore('org-1', [{ name: ' ', needsMobile: true, needsVenue: false }])
    ).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })
})
