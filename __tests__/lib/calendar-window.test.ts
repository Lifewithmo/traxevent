import { describe, it, expect } from 'vitest'
import { calendarWindow, feedInWindow, normalizeView } from '@/lib/calendar-window'
import type { CalendarItem } from '@/lib/calendar'

describe('normalizeView', () => {
  it('defaults unknown or missing views to week', () => {
    expect(normalizeView(undefined)).toBe('week')
    expect(normalizeView('nonsense')).toBe('week')
    expect(normalizeView('month')).toBe('month')
    expect(normalizeView('agenda')).toBe('agenda')
  })
})

const item = (id: string, date: string, endDate?: string): CalendarItem => ({
  id,
  title: id,
  date,
  kind: 'event',
  href: `/acme/${id}`,
  ...(endDate ? { endDate } : {}),
})

describe('calendarWindow', () => {
  it('bounds the week view to its Monday–Sunday span', () => {
    expect(calendarWindow('week', '2026-08-19')).toEqual({ from: '2026-08-17', to: '2026-08-23' })
  })

  it('bounds the day view to the single day', () => {
    expect(calendarWindow('day', '2026-08-20')).toEqual({ from: '2026-08-20', to: '2026-08-20' })
  })

  it('bounds the month view to the padded 6-week grid', () => {
    // August 2026 starts on a Saturday; the Monday-start grid leads with July.
    const w = calendarWindow('month', '2026-08-10')!
    expect(w.from <= '2026-08-01').toBe(true)
    expect(w.to >= '2026-08-31').toBe(true)
  })

  it('returns null for agenda (the whole feed is intended)', () => {
    expect(calendarWindow('agenda', '2026-08-19')).toBeNull()
  })
})

describe('feedInWindow', () => {
  const feed = [
    item('inside', '2026-08-19'),
    item('before', '2026-08-01'),
    item('after', '2026-09-15'),
    item('spanning', '2026-08-10', '2026-08-19'), // starts before the week, spans in
  ]

  it('keeps only items overlapping the week window — including spanning ones', () => {
    const kept = feedInWindow(feed, 'week', '2026-08-19').map((i) => i.id)
    expect(kept).toContain('inside')
    expect(kept).toContain('spanning') // span-aware: NOT dropped like a start-date bound would
    expect(kept).not.toContain('before')
    expect(kept).not.toContain('after')
  })

  it('passes the whole feed through untouched for agenda', () => {
    expect(feedInWindow(feed, 'agenda', '2026-08-19')).toHaveLength(feed.length)
  })
})
