import { describe, it, expect } from 'vitest'
import { buildCalendar } from '@/lib/calendar'
import type { Event, Lead } from '@/lib/types'

function event(overrides: Partial<Event>): Event {
  return {
    id: 'c1',
    name: 'Spring Gathering',
    slug: 'spring-gathering',
    event_start: '2026-07-10',
    ...overrides,
  } as Event
}

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 'l1',
    name: 'Acme Wedding',
    stage: 'inquiry',
    event_date: '2026-07-05',
    created_at: 'x',
    ...overrides,
  } as Lead
}

describe('buildCalendar', () => {
  it('merges camps and leads sorted ascending by date', () => {
    const items = buildCalendar(
      'my-org',
      [event({ id: 'c1', name: 'Spring Gathering', slug: 'spring-gathering', event_start: '2026-07-10' })],
      [lead({ id: 'l1', name: 'Acme Wedding', event_date: '2026-07-05' })]
    )
    expect(items.map((i) => i.date)).toEqual(['2026-07-05', '2026-07-10'])
    expect(items.map((i) => i.id)).toEqual(['l1', 'c1'])
  })

  it('omits items missing event_start or event_date', () => {
    const items = buildCalendar(
      'my-org',
      [event({ id: 'c1', event_start: '' }), event({ id: 'c2', event_start: '2026-08-01' })],
      [lead({ id: 'l1', event_date: undefined }), lead({ id: 'l2', event_date: '2026-07-01' })]
    )
    expect(items.map((i) => i.id)).toEqual(['l2', 'c2'])
  })

  it('sets kind and href correctly for camps (event) and leads (lead)', () => {
    const items = buildCalendar(
      'my-org',
      [event({ id: 'c1', slug: 'spring-gathering', event_start: '2026-07-10' })],
      [lead({ id: 'l1', event_date: '2026-07-05' })]
    )
    const evt = items.find((i) => i.id === 'c1')!
    const ld = items.find((i) => i.id === 'l1')!
    expect(evt.kind).toBe('event')
    expect(evt.href).toBe('/my-org/spring-gathering/dashboard')
    expect(ld.kind).toBe('lead')
    expect(ld.href).toBe('/my-org/leads/l1')
  })

  it('uses the lead title for the calendar item title when present', () => {
    const items = buildCalendar(
      'my-org',
      [],
      [lead({ id: 'l1', name: 'Dana Kim', title: 'Riverside gala', event_date: '2026-07-05' })]
    )
    expect(items[0].title).toBe('Riverside gala')
  })

  it('falls back to the contact name when the lead has no title', () => {
    const items = buildCalendar(
      'my-org',
      [],
      [lead({ id: 'l1', name: 'Dana Kim', title: undefined, event_date: '2026-07-05' })]
    )
    expect(items[0].title).toBe('Dana Kim')
  })
})
