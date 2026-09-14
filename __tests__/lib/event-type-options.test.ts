import { describe, it, expect } from 'vitest'
import { buildEventTypeOptions } from '@/lib/crm/event-type-options'

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
})
