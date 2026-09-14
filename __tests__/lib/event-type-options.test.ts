import { describe, it, expect } from 'vitest'
import {
  eventTypeProfileNames,
  activeEventTypeProfiles,
  pastJobCounts,
} from '@/lib/crm/event-type-options'

/*
  Profile helpers for the create surfaces (event types inc 1). The old
  `buildEventTypeOptions` chip vocabulary (profiles + history, cap 8) left
  with the chip row itself — the pickers list ACTIVE profiles only, through
  the shared EventTypeSelect.
*/

const profile = (name: string) => ({ name, needsMobile: true, needsVenue: false })

/*
  CONTRACT C5b: `eventTypeProfileNames` is the form's "is this a CONFIGURED
  type?" key — the raw ACTIVE profile vocabulary. Trimmed, original casing.
*/
describe('eventTypeProfileNames', () => {
  it('returns the profile names trimmed, in profile order, original casing', () => {
    expect(eventTypeProfileNames([profile('  Wedding '), profile('market DAY')])).toEqual([
      'Wedding', 'market DAY',
    ])
  })

  it('drops blank names and returns [] for no profiles', () => {
    expect(eventTypeProfileNames([profile('   '), profile('Gala')])).toEqual(['Gala'])
    expect(eventTypeProfileNames(undefined)).toEqual([])
    expect(eventTypeProfileNames([])).toEqual([])
  })

  it('excludes archived profiles — ACTIVE names only (inc 1)', () => {
    expect(eventTypeProfileNames([
      { ...profile('Wedding'), id: 'a' },
      { ...profile('Gala'), id: 'b', archived: true },
    ])).toEqual(['Wedding'])
  })
})

/*
  `activeEventTypeProfiles` (event types inc 1): the full ACTIVE profile objects
  in display (array) order — what the pickers and the inline-create popover
  consume when they need ids + policy flags, not just name strings.
*/
describe('activeEventTypeProfiles', () => {
  it('filters archived entries and preserves array order', () => {
    const wedding = { id: 'a', name: 'Wedding', needsMobile: true, needsVenue: true }
    const gala = { id: 'b', name: 'Gala', needsMobile: true, needsVenue: false, archived: true }
    const market = { id: 'c', name: 'Market', needsMobile: true, needsVenue: false }
    expect(activeEventTypeProfiles([wedding, gala, market])).toEqual([wedding, market])
  })

  it('returns [] for undefined or empty profiles', () => {
    expect(activeEventTypeProfiles(undefined)).toEqual([])
    expect(activeEventTypeProfiles([])).toEqual([])
  })
})

/*
  CONTRACT C5b: `pastJobCounts` feeds the caller-recognition hint's "{n} past
  jobs" — total opportunity count per customer_id over whatever lead set the
  page loaded (the pipeline page feeds every lead, open or closed: a past job
  is a past job regardless of how it ended).
*/
describe('pastJobCounts', () => {
  it('counts every lead per customer_id', () => {
    const rows = [
      { customer_id: 'c1' }, { customer_id: 'c2' }, { customer_id: 'c1' },
      { customer_id: 'c1' },
    ]
    expect(pastJobCounts(rows)).toEqual({ c1: 3, c2: 1 })
  })

  it('skips leads with no customer link and returns {} for none', () => {
    expect(pastJobCounts([{ customer_id: undefined }, {}])).toEqual({})
    expect(pastJobCounts([])).toEqual({})
  })
})
