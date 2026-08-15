import { describe, it, expect } from 'vitest'
import { selectUpcomingEvents } from '@/lib/sidebar-events'
import type { Event } from '@/lib/types'

function ev(id: string, start: string, status: Event['status'] = 'active'): Event {
  return { id, name: `Event ${id}`, slug: `event-${id}`, event_start: start, status } as Event
}

describe('selectUpcomingEvents', () => {
  it('returns at most 5 rows sorted by start date ascending', () => {
    const events = [
      ev('e', '2026-09-01'), ev('a', '2026-08-16'), ev('c', '2026-08-20'),
      ev('b', '2026-08-18'), ev('f', '2026-09-10'), ev('d', '2026-08-25'),
    ]
    const rows = selectUpcomingEvents(events, '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('labels an event starting today as "Today" and flags isToday', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-15')], '2026-08-15')
    expect(rows[0].label).toBe('Today')
    expect(rows[0].isToday).toBe(true)
  })

  it('labels a future event with a short date and does not flag isToday', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-20')], '2026-08-15')
    expect(rows[0].label).toBe('Aug 20')
    expect(rows[0].isToday).toBe(false)
  })

  it('excludes events that started before today', () => {
    const rows = selectUpcomingEvents([ev('past', '2026-08-14'), ev('now', '2026-08-15')], '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['now'])
  })

  it('excludes archived events', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-20', 'archived'), ev('b', '2026-08-21')], '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['b'])
  })

  it('returns fewer than 5 rows when fewer events qualify', () => {
    expect(selectUpcomingEvents([ev('a', '2026-08-20')], '2026-08-15')).toHaveLength(1)
  })

  it('returns an empty array when nothing is upcoming', () => {
    expect(selectUpcomingEvents([], '2026-08-15')).toEqual([])
  })

  it('omits events with no start date', () => {
    const noDate = { id: 'x', name: 'X', slug: 'x', status: 'active' } as Event
    expect(selectUpcomingEvents([noDate], '2026-08-15')).toEqual([])
  })
})
