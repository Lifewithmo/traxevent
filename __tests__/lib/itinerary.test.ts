import { describe, it, expect } from 'vitest'
import { groupItineraryByDay, formatTime } from '@/lib/itinerary'
import type { ItineraryItem } from '@/lib/types'

function item(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 'i1', day: '2026-07-10', start_time: '09:00', title: 'Activity',
    sort_order: 0, created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('groupItineraryByDay', () => {
  it('groups items by day in chronological order, sorted by start time within a day', () => {
    const items = [
      item({ id: 'b', day: '2026-07-11', start_time: '08:00', title: 'Breakfast Day2' }),
      item({ id: 'a', day: '2026-07-10', start_time: '14:00', title: 'Afternoon' }),
      item({ id: 'c', day: '2026-07-10', start_time: '09:00', title: 'Morning' }),
    ]
    const days = groupItineraryByDay(items)
    expect(days).toHaveLength(2)
    expect(days[0].day).toBe('2026-07-10')
    expect(days[0].items.map((i) => i.title)).toEqual(['Morning', 'Afternoon'])
    expect(days[1].day).toBe('2026-07-11')
    expect(days[1].items.map((i) => i.title)).toEqual(['Breakfast Day2'])
  })

  it('breaks start-time ties with sort_order', () => {
    const items = [
      item({ id: 'a', day: '2026-07-10', start_time: '09:00', title: 'Second', sort_order: 1 }),
      item({ id: 'b', day: '2026-07-10', start_time: '09:00', title: 'First', sort_order: 0 }),
    ]
    const days = groupItineraryByDay(items)
    expect(days[0].items.map((i) => i.title)).toEqual(['First', 'Second'])
  })

  it('returns an empty array for no items', () => {
    expect(groupItineraryByDay([])).toEqual([])
  })
})

describe('formatTime', () => {
  it('formats 24h HH:MM as 12h with am/pm', () => {
    expect(formatTime('09:00')).toBe('9:00 AM')
    expect(formatTime('14:30')).toBe('2:30 PM')
    expect(formatTime('00:00')).toBe('12:00 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
    expect(formatTime('23:05')).toBe('11:05 PM')
  })

  it('returns empty string for blank input', () => {
    expect(formatTime('')).toBe('')
  })
})
