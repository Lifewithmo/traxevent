import { describe, it, expect } from 'vitest'
import { weekdayOf, isServiceable, serviceableDatesInMonth } from '@/lib/capacity/serviceable'
import type { Org } from '@/lib/types'

describe('weekdayOf', () => {
  it('reads the weekday from ymd parts (UTC-safe)', () => {
    expect(weekdayOf('2026-09-05')).toBe(6) // Saturday
    expect(weekdayOf('2026-09-06')).toBe(0) // Sunday
    expect(weekdayOf('2026-09-07')).toBe(1) // Monday
  })

  it('is stable across month/year boundaries', () => {
    expect(weekdayOf('2026-01-01')).toBe(4) // Thursday
    expect(weekdayOf('2026-12-31')).toBe(4) // Thursday
  })
})

describe('isServiceable', () => {
  const weekdaysMonFri: Org['serviceable_days'] = { weekdays: [1, 2, 3, 4, 5] }

  it('is true for every day when cfg is absent', () => {
    expect(isServiceable('2026-09-05', undefined)).toBe(true) // a Saturday
    expect(isServiceable('2026-09-06', undefined)).toBe(true) // a Sunday
  })

  it('is false when the weekday is not in the set', () => {
    expect(isServiceable('2026-09-05', weekdaysMonFri)).toBe(false) // Sat
    expect(isServiceable('2026-09-06', weekdaysMonFri)).toBe(false) // Sun
    expect(isServiceable('2026-09-07', weekdaysMonFri)).toBe(true) // Mon
  })

  it('is false for every day when weekdays is empty', () => {
    expect(isServiceable('2026-09-07', { weekdays: [] })).toBe(false)
    expect(isServiceable('2026-09-05', { weekdays: [] })).toBe(false)
  })

  it('is false inside a closure, inclusive of start and end days', () => {
    const cfg: Org['serviceable_days'] = {
      closures: [{ start: '2026-12-24', end: '2026-12-26', note: 'Holiday' }],
    }
    expect(isServiceable('2026-12-24', cfg)).toBe(false) // start day
    expect(isServiceable('2026-12-25', cfg)).toBe(false) // middle
    expect(isServiceable('2026-12-26', cfg)).toBe(false) // end day
    expect(isServiceable('2026-12-23', cfg)).toBe(true)
    expect(isServiceable('2026-12-27', cfg)).toBe(true)
  })

  it('requires both the weekday set AND no closure', () => {
    const cfg: Org['serviceable_days'] = {
      weekdays: [1, 2, 3, 4, 5],
      closures: [{ start: '2026-09-09', end: '2026-09-09' }],
    }
    expect(isServiceable('2026-09-08', cfg)).toBe(true) // Tue, no closure
    expect(isServiceable('2026-09-09', cfg)).toBe(false) // Wed but closed
    expect(isServiceable('2026-09-12', cfg)).toBe(false) // Sat, not in set
  })
})

describe('serviceableDatesInMonth', () => {
  it('returns ascending ymds in the month that are >= fromYmd and serviceable', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1, 2, 3, 4, 5] } // Mon–Fri
    const dates = serviceableDatesInMonth('2026-09', '2026-09-10', cfg)
    // no day before the 10th
    expect(dates.every((d) => d >= '2026-09-10')).toBe(true)
    // no weekend day
    expect(dates.includes('2026-09-12')).toBe(false) // Sat
    expect(dates.includes('2026-09-13')).toBe(false) // Sun
    // weekdays included
    expect(dates.includes('2026-09-10')).toBe(true) // Thu
    expect(dates.includes('2026-09-11')).toBe(true) // Fri
    // ascending
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
  })

  it('drops days inside a closure', () => {
    const cfg: Org['serviceable_days'] = {
      closures: [{ start: '2026-09-15', end: '2026-09-17' }],
    }
    const dates = serviceableDatesInMonth('2026-09', '2026-09-01', cfg)
    expect(dates.includes('2026-09-14')).toBe(true)
    expect(dates.includes('2026-09-15')).toBe(false)
    expect(dates.includes('2026-09-16')).toBe(false)
    expect(dates.includes('2026-09-17')).toBe(false)
    expect(dates.includes('2026-09-18')).toBe(true)
  })

  it('spans the full month when cfg is absent and fromYmd is the 1st', () => {
    const dates = serviceableDatesInMonth('2026-02', '2026-02-01', undefined)
    expect(dates.length).toBe(28) // Feb 2026, non-leap
    expect(dates[0]).toBe('2026-02-01')
    expect(dates[dates.length - 1]).toBe('2026-02-28')
  })
})
