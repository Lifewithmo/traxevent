import { describe, it, expect } from 'vitest'
import { getEventType, getAllEventTypes, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'

describe('DEFAULT_EVENT_TYPE_ID', () => {
  it('is summer-camp', () => {
    expect(DEFAULT_EVENT_TYPE_ID).toBe('summer-camp')
  })
})

describe('getEventType', () => {
  it('returns summer-camp config', () => {
    const et = getEventType('summer-camp')
    expect(et.id).toBe('summer-camp')
    expect(et.name).toBe('Summer Camp')
    expect(et.registrationUnit).toBe('family')
    expect(et.terminology.registrantPlural).toBe('Families')
    expect(et.terminology.memberSingular).toBe('Camper')
    expect(et.terminology.assignmentSingular).toBe('Cabin')
    expect(et.terminology.eventLabel).toBe('Camp')
  })

  it('returns retreat config', () => {
    const et = getEventType('retreat')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Registrants')
    expect(et.terminology.assignmentSingular).toBe('Room')
  })

  it('returns vbs config', () => {
    const et = getEventType('vbs')
    expect(et.registrationUnit).toBe('child')
    expect(et.terminology.registrantPlural).toBe('Children')
    expect(et.terminology.assignmentSingular).toBe('Class')
  })

  it('returns gala config', () => {
    const et = getEventType('gala')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Guests')
    expect(et.terminology.assignmentSingular).toBe('Table')
  })

  it('returns mission-trip config', () => {
    const et = getEventType('mission-trip')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Participants')
    expect(et.terminology.assignmentSingular).toBe('Team')
  })

  it('falls back to summer-camp for unknown id', () => {
    const et = getEventType('unknown-type')
    expect(et.id).toBe('summer-camp')
  })
})

describe('getAllEventTypes', () => {
  it('returns all 5 built-in types', () => {
    const all = getAllEventTypes()
    expect(all).toHaveLength(5)
    const ids = all.map((et) => et.id)
    expect(ids).toContain('summer-camp')
    expect(ids).toContain('retreat')
    expect(ids).toContain('vbs')
    expect(ids).toContain('gala')
    expect(ids).toContain('mission-trip')
  })

  it('each type has all required terminology keys', () => {
    for (const et of getAllEventTypes()) {
      expect(et.terminology.registrantSingular).toBeTruthy()
      expect(et.terminology.registrantPlural).toBeTruthy()
      expect(et.terminology.memberSingular).toBeTruthy()
      expect(et.terminology.memberPlural).toBeTruthy()
      expect(et.terminology.assignmentSingular).toBeTruthy()
      expect(et.terminology.assignmentPlural).toBeTruthy()
      expect(et.terminology.eventLabel).toBeTruthy()
    }
  })
})
