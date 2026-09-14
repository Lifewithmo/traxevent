import { describe, it, expect } from 'vitest'
import {
  buildEventTypeOptions,
  eventTypeProfileNames,
  activeEventTypeProfiles,
  pastJobCounts,
} from '@/lib/crm/event-type-options'

/*
  THE CHIP VOCABULARY RULE (New Opportunity inc 1, plan §Agent C item 1):
  profile names first, in profile order — they are the org's AUTHORITATIVE
  vocabulary and drive the capacity verdict — then the org's own historical
  free-text types by frequency, deduped case-insensitively against the profiles
  and each other, capped at 8 total. One rule, shared by the pipeline page
  (whole-org history) and the cockpit page (this customer's history), so the two
  create surfaces can never grow different chip rows from the same data.
*/

const profile = (name: string) => ({ name, needsMobile: true, needsVenue: false })
const withType = (event_type?: string) => ({ event_type })

describe('buildEventTypeOptions', () => {
  it('returns profile names first, in profile order', () => {
    expect(buildEventTypeOptions([profile('Wedding'), profile('Market')], [])).toEqual([
      'Wedding', 'Market',
    ])
  })

  it('appends historical types ordered by frequency desc', () => {
    const leads = [
      withType('Corporate'), withType('Birthday'), withType('Corporate'),
      withType('Corporate'), withType('Birthday'), withType('Festival'),
    ]
    expect(buildEventTypeOptions(undefined, leads)).toEqual([
      'Corporate', 'Birthday', 'Festival',
    ])
  })

  it('dedupes history against profiles case-insensitively and after trimming', () => {
    const leads = [withType('  wedding '), withType('WEDDING'), withType('Gala')]
    expect(buildEventTypeOptions([profile('Wedding')], leads)).toEqual(['Wedding', 'Gala'])
  })

  it('dedupes history against itself, keeping the first-seen casing', () => {
    const leads = [withType('corporate gala'), withType('Corporate Gala'), withType('corporate gala')]
    expect(buildEventTypeOptions(undefined, leads)).toEqual(['corporate gala'])
  })

  it('skips leads with no type and blank/whitespace-only types', () => {
    const leads = [withType(undefined), withType(''), withType('   '), withType('Market')]
    expect(buildEventTypeOptions(undefined, leads)).toEqual(['Market'])
  })

  it('breaks frequency ties by first occurrence, deterministically', () => {
    const leads = [withType('Brunch'), withType('Gala'), withType('Gala'), withType('Brunch')]
    expect(buildEventTypeOptions(undefined, leads)).toEqual(['Brunch', 'Gala'])
  })

  it('caps the combined list at 8, profiles included', () => {
    const profiles = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(profile)
    const leads = ['H1', 'H2', 'H3', 'H4'].flatMap((t, i) =>
      // Descending frequency so the cut is deterministic: H1 most frequent.
      Array.from({ length: 4 - i }, () => withType(t))
    )
    expect(buildEventTypeOptions(profiles, leads)).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'H1', 'H2',
    ])
  })

  it('returns [] for an org with no profiles and no history (0-profiles empty state upstream)', () => {
    expect(buildEventTypeOptions(undefined, [])).toEqual([])
  })

  /*
    ARCHIVED EXCLUSION (event types inc 1, spec §4): an archived profile's name
    must vanish from the chip row on BOTH sides — it is not an active chip, and
    it must not resurface as a frequency chip from history either (that would
    undo the archive one lead at a time).
  */
  it('excludes an archived profile name from both the profile side and history', () => {
    const profiles = [
      { id: 'a', name: 'Wedding', needsMobile: true, needsVenue: true },
      { id: 'b', name: 'Gala', needsMobile: true, needsVenue: false, archived: true },
    ]
    const leads = [withType('gala'), withType('GALA'), withType('gala'), withType('Brunch')]
    expect(buildEventTypeOptions(profiles, leads)).toEqual(['Wedding', 'Brunch'])
  })

  it('an archived profile does not consume a cap-8 slot', () => {
    const profiles = [
      { ...profile('Dead'), id: 'x', archived: true },
      ...['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map(profile),
    ]
    expect(buildEventTypeOptions(profiles, [])).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8',
    ])
  })
})

/*
  CONTRACT C5b: `eventTypeProfileNames` is the form's "is this a CONFIGURED
  type?" key — the raw profile vocabulary, independent of the merged chip list
  above (which mixes in history and caps at 8, so it cannot answer that
  question). Trimmed, original casing.
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
