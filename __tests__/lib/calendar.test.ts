import { describe, it, expect } from 'vitest'
import { buildCalendar } from '@/lib/calendar'
import type { Event, Lead } from '@/lib/types'

function camp(overrides: Partial<Event>): Event {
  return {
    id: 'c1',
    name: 'Summer Camp',
    slug: 'summer-camp',
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
      [camp({ id: 'c1', name: 'Summer Camp', slug: 'summer-camp', event_start: '2026-07-10' })],
      [lead({ id: 'l1', name: 'Acme Wedding', event_date: '2026-07-05' })]
    )
    expect(items.map((i) => i.date)).toEqual(['2026-07-05', '2026-07-10'])
    expect(items.map((i) => i.id)).toEqual(['l1', 'c1'])
  })

  it('omits items missing event_start or event_date', () => {
    const items = buildCalendar(
      'my-org',
      [camp({ id: 'c1', event_start: '' }), camp({ id: 'c2', event_start: '2026-08-01' })],
      [lead({ id: 'l1', event_date: undefined }), lead({ id: 'l2', event_date: '2026-07-01' })]
    )
    expect(items.map((i) => i.id)).toEqual(['l2', 'c2'])
  })

  it('sets kind and href correctly for camps (event) and leads (lead)', () => {
    const items = buildCalendar(
      'my-org',
      [camp({ id: 'c1', slug: 'summer-camp', event_start: '2026-07-10' })],
      [lead({ id: 'l1', event_date: '2026-07-05' })]
    )
    const evt = items.find((i) => i.id === 'c1')!
    const ld = items.find((i) => i.id === 'l1')!
    expect(evt.kind).toBe('event')
    expect(evt.href).toBe('/my-org/summer-camp/dashboard')
    expect(ld.kind).toBe('lead')
    expect(ld.href).toBe('/my-org/leads/l1')
  })
})
