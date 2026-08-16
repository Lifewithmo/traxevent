import { describe, it, expect } from 'vitest'
import { buildCalendar, calendarRangeItems, filterFeed, PIPELINE_KINDS, type CalendarItem } from '@/lib/calendar'
import type { Event, Lead, Task } from '@/lib/types'

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

  it('shows a converted lead once, as the event, not twice', () => {
    const items = buildCalendar(
      'my-org',
      [event({ id: 'c1', name: 'Nguyen Wedding', slug: 'nguyen-wedding-2026', event_start: '2026-09-12', lead_id: 'l1' } as Partial<Event>)],
      [lead({ id: 'l1', name: 'Nguyen Wedding', event_date: '2026-09-12' })]
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'c1', kind: 'event' })
  })

  it('still lists an unconverted lead alongside unrelated events', () => {
    const items = buildCalendar(
      'my-org',
      [event({ id: 'c1', name: 'Other Job', slug: 'other-job-2026', event_start: '2026-09-12', lead_id: 'l2' } as Partial<Event>)],
      [lead({ id: 'l1', name: 'Nguyen Wedding', event_date: '2026-09-12' })]
    )
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['c1', 'l1']))
    expect(items).toHaveLength(2)
  })
})

describe('calendarRangeItems', () => {
  const event = (over: Partial<Event>): Event => ({
    id: 'e1', name: 'Gala', slug: 'gala', event_start: '2026-08-12', ...over,
  } as Event)
  const lead = (over: Partial<Lead>): Lead => ({
    id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
  } as Lead)
  const task = (over: Partial<Task>): Task => ({
    id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
  } as Task)

  it('merges events, tentative leads, and dated open tasks inside the range, sorted', () => {
    const l = lead({ event_date: '2026-08-15' })
    const items = calendarRangeItems('demo', [event({})], [l],
      [{ lead: l, tasks: [task({ due_date: '2026-08-10' })] }], '2026-08-09', '2026-08-18')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['task:t1', 'event:e1', 'lead:l1'])
    expect(items[0].href).toBe('/demo/leads/l1')
  })
  it('excludes items outside the range, done tasks, undated tasks, and scheduled leads', () => {
    const scheduled = lead({ id: 'l2', event_date: '2026-08-15' })
    const items = calendarRangeItems('demo',
      [event({ event_start: '2026-08-25' }), event({ id: 'e2', lead_id: 'l2', event_start: '2026-08-15' })],
      [scheduled],
      [{ lead: scheduled, tasks: [task({ done: true, due_date: '2026-08-10' }), task({ id: 't2' })] }],
      '2026-08-09', '2026-08-18')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['event:e2'])
  })
})

describe('filterFeed with PIPELINE_KINDS', () => {
  const item = (over: Partial<CalendarItem>): CalendarItem => ({
    id: 'x1', title: 'X', date: '2026-08-12', kind: 'lead', href: '/demo/leads/x1', ...over,
  } as CalendarItem)

  it('keeps lead, task, and follow_up items', () => {
    const feed: CalendarItem[] = [
      item({ id: 'l1', kind: 'lead' }),
      item({ id: 't1', kind: 'task' }),
      item({ id: 'f1', kind: 'follow_up' }),
    ]
    expect(filterFeed(feed, PIPELINE_KINDS).map((i) => i.id)).toEqual(['l1', 't1', 'f1'])
  })

  it('drops event, compliance, and invoice_due items', () => {
    const feed: CalendarItem[] = [
      item({ id: 'e1', kind: 'event' }),
      item({ id: 'c1', kind: 'compliance' }),
      item({ id: 'i1', kind: 'invoice_due' }),
      item({ id: 'l1', kind: 'lead' }),
    ]
    expect(filterFeed(feed, PIPELINE_KINDS).map((i) => i.id)).toEqual(['l1'])
  })
})
