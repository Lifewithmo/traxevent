import { describe, it, expect } from 'vitest'
import { resolveTerminology, getEventType } from '@/lib/event-types'
import type { Terminology } from '@/lib/event-types'

const customTerm: Terminology = {
  registrantSingular: 'Athlete', registrantPlural: 'Athletes',
  memberSingular: 'Player', memberPlural: 'Players',
  assignmentSingular: 'Squad', assignmentPlural: 'Squads',
  eventLabel: 'Clinic',
}

describe('resolveTerminology', () => {
  it('returns the snapshot when provided', () => {
    expect(resolveTerminology('summer-camp', customTerm)).toBe(customTerm)
  })
  it('falls back to the built-in event type terminology when no snapshot', () => {
    expect(resolveTerminology('summer-camp')).toEqual(getEventType('summer-camp').terminology)
  })
  it('falls back to default event type for an unknown id with no snapshot', () => {
    expect(resolveTerminology('unknown-custom-id')).toEqual(getEventType('summer-camp').terminology)
  })
})
