import { describe, it, expect } from 'vitest'
import { getEventType, getAllEventTypes, DEFAULT_EVENT_TYPE_ID, eventCreateFieldsFromType } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'

describe('DEFAULT_EVENT_TYPE_ID', () => {
  it('is event', () => {
    expect(DEFAULT_EVENT_TYPE_ID).toBe('event')
  })
})

describe('getEventType', () => {
  it('returns event config', () => {
    const et = getEventType('event')
    expect(et.id).toBe('event')
    expect(et.name).toBe('General Event')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Customers')
    expect(et.terminology.memberSingular).toBe('Guest')
    expect(et.terminology.assignmentSingular).toBe('Assignment')
    expect(et.terminology.eventLabel).toBe('Event')
  })

  it('returns catering config', () => {
    const et = getEventType('catering')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Clients')
    expect(et.terminology.assignmentSingular).toBe('Station')
  })

  it('returns photo-shoot config', () => {
    const et = getEventType('photo-shoot')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.memberPlural).toBe('Subjects')
    expect(et.terminology.assignmentSingular).toBe('Session')
  })

  it('returns floral-event config', () => {
    const et = getEventType('floral-event')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.memberPlural).toBe('Recipients')
    expect(et.terminology.assignmentSingular).toBe('Delivery')
  })

  it('returns coffee-service config', () => {
    const et = getEventType('coffee-service')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Clients')
    expect(et.terminology.eventLabel).toBe('Service')
  })

  it('falls back to event for unknown id', () => {
    const et = getEventType('unknown-type')
    expect(et.id).toBe('event')
  })
})

describe('getAllEventTypes', () => {
  it('returns all 5 built-in types', () => {
    const all = getAllEventTypes()
    expect(all).toHaveLength(5)
    const ids = all.map((et) => et.id)
    expect(ids).toContain('event')
    expect(ids).toContain('catering')
    expect(ids).toContain('photo-shoot')
    expect(ids).toContain('floral-event')
    expect(ids).toContain('coffee-service')
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

describe('eventCreateFieldsFromType', () => {
  it('carries id and registration unit from a built-in type', () => {
    expect(eventCreateFieldsFromType(getEventType('coffee-service'))).toEqual({
      event_type_id: 'coffee-service',
      registration_type: 'individual',
    })
  })

  it('omits terminology for a built-in type', () => {
    expect('event_type_terminology' in eventCreateFieldsFromType(getEventType('catering'))).toBe(false)
  })

  it('snapshots terminology for a custom type', () => {
    const custom = { ...getEventType('event'), id: 'org-custom', is_custom: true } as EventType
    const fields = eventCreateFieldsFromType(custom)
    expect(fields.event_type_id).toBe('org-custom')
    expect(fields.event_type_terminology).toEqual(custom.terminology)
  })
})
