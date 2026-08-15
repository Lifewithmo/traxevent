import { describe, it, expect } from 'vitest'
import { seriesOccurrences, SERIES_OCCURRENCE_CAP } from '@/lib/occasions/series-logic'

const rec = (from: string, until: string, weekday = 6) =>
  ({ freq: 'weekly' as const, weekday, from, until })

describe('seriesOccurrences', () => {
  it('generates every Saturday in the window, inclusive of both ends', () => {
    // 2026-05-02 is a Saturday; 2026-05-30 is a Saturday.
    expect(seriesOccurrences(rec('2026-05-02', '2026-05-30'))).toEqual([
      '2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23', '2026-05-30',
    ])
  })
  it('starts at the first matching weekday ON or AFTER from', () => {
    // 2026-05-01 is a Friday → first Saturday is 05-02.
    expect(seriesOccurrences(rec('2026-05-01', '2026-05-09'))[0]).toBe('2026-05-02')
  })
  it('excludes days past until', () => {
    // until on a Friday → the following Saturday is out.
    expect(seriesOccurrences(rec('2026-05-02', '2026-05-29')).at(-1)).toBe('2026-05-23')
  })
  it('returns [] when the window contains no matching weekday', () => {
    // Sun 2026-05-03 .. Fri 2026-05-08 contains no Saturday.
    expect(seriesOccurrences(rec('2026-05-03', '2026-05-08'))).toEqual([])
  })
  it('crosses month and DST boundaries with pure date math', () => {
    // March 2026 DST shift (US) must not skip or duplicate a week.
    const days = seriesOccurrences(rec('2026-03-01', '2026-03-31', 0)) // Sundays
    expect(days).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'])
  })
  it(`throws naming the cap when occurrences exceed ${SERIES_OCCURRENCE_CAP}`, () => {
    expect(() => seriesOccurrences(rec('2026-01-03', '2026-12-26'))).toThrow(String(SERIES_OCCURRENCE_CAP))
  })
  it('validates inputs', () => {
    expect(() => seriesOccurrences(rec('nope', '2026-05-30'))).toThrow('date')
    expect(() => seriesOccurrences(rec('2026-05-30', '2026-05-02'))).toThrow('after')
    expect(() => seriesOccurrences({ freq: 'weekly', weekday: 7, from: '2026-05-02', until: '2026-05-30' })).toThrow('weekday')
  })
})
