import { describe, it, expect } from 'vitest'
import {
  windowDays, rangeLabel, daysOutLabel, monthStartOf, addMonths,
  monthLabel, monthGrid, bucketByDay, shortDayLabel, listDateLabel,
} from '@/lib/date-window'
import type { CalendarItem } from '@/lib/calendar'

describe('windowDays', () => {
  it('is five before, the center, four after', () => {
    const days = windowDays('2026-08-14')
    expect(days).toHaveLength(10)
    expect(days[0]).toBe('2026-08-09')
    expect(days[5]).toBe('2026-08-14')
    expect(days[9]).toBe('2026-08-18')
  })
  it('crosses month boundaries', () => {
    const days = windowDays('2026-09-04')
    expect(days[0]).toBe('2026-08-30')
    expect(days[9]).toBe('2026-09-08')
  })
})

describe('rangeLabel', () => {
  it('labels same-month and cross-month windows', () => {
    expect(rangeLabel(windowDays('2026-08-14'))).toBe('AUG 9 – 18')
    expect(rangeLabel(windowDays('2026-09-04'))).toBe('AUG 30 – SEP 8')
  })
})

describe('daysOutLabel', () => {
  it('handles future, today, past, and missing dates', () => {
    expect(daysOutLabel('2026-09-04', '2026-08-07')).toBe('28 days out')
    expect(daysOutLabel('2026-08-08', '2026-08-07')).toBe('1 day out')
    expect(daysOutLabel('2026-08-07', '2026-08-07')).toBe('today')
    expect(daysOutLabel('2026-08-04', '2026-08-07')).toBe('3 days ago')
    expect(daysOutLabel(undefined, '2026-08-07')).toBeNull()
  })
})

describe('month math', () => {
  it('finds month start and pages by month', () => {
    expect(monthStartOf('2026-08-14')).toBe('2026-08-01')
    expect(addMonths('2026-08-01', 1)).toBe('2026-09-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(monthLabel('2026-08-01')).toBe('AUGUST 2026')
  })
  it('builds a Monday-first grid covering August 2026 (Jul 27 – Sep 6)', () => {
    const grid = monthGrid('2026-08-01')
    expect(grid[0]).toEqual({ ymd: '2026-07-27', inMonth: false })
    expect(grid[5]).toEqual({ ymd: '2026-08-01', inMonth: true })
    expect(grid[grid.length - 1]).toEqual({ ymd: '2026-09-06', inMonth: false })
    expect(grid).toHaveLength(42)
  })
})

describe('bucketByDay', () => {
  it('buckets by the date part, only for the given days', () => {
    const items = [
      { id: 'e1', title: 'Gala', date: '2026-08-12', kind: 'event', href: '#' },
      { id: 't1', title: 'Call', date: '2026-08-12', kind: 'task', href: '#' },
      { id: 'e2', title: 'Out of window', date: '2026-08-25T18:00:00.000Z', kind: 'event', href: '#' },
    ] as CalendarItem[]
    const buckets = bucketByDay(items, windowDays('2026-08-14'))
    expect(buckets['2026-08-12'].map((i) => i.id)).toEqual(['e1', 't1'])
    expect(buckets['2026-08-25']).toBeUndefined()
  })
})

describe('labels', () => {
  it('formats day cells and list dates', () => {
    expect(shortDayLabel('2026-08-09')).toEqual({ weekday: 'S', day: 9 })   // Sunday
    expect(shortDayLabel('2026-08-10')).toEqual({ weekday: 'M', day: 10 })
    expect(listDateLabel('2026-08-12')).toBe('Wed Aug 12')
  })
})
