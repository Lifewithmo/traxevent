import { describe, expect, it } from 'vitest'
import {
  EVENT_STATUS_TONE,
  FAMILY_LABEL,
  FAMILY_TONE,
  eventCountdown,
  formatEventDate,
  formatEventDateRange,
  parseDay,
} from '@/lib/event-ui'

describe('tone maps', () => {
  it('preserves the legacy family tone/label mapping', () => {
    expect(FAMILY_TONE.waitlisted).toBe('alert')
    expect(FAMILY_TONE.cancelled).toBe('neutral')
    expect(FAMILY_LABEL.waitlisted).toBe('Waitlist')
  })

  it('maps event statuses to pill tones', () => {
    expect(EVENT_STATUS_TONE.active).toBe('confirmed')
    expect(EVENT_STATUS_TONE.draft).toBe('pending')
    expect(EVENT_STATUS_TONE.archived).toBe('neutral')
  })
})

describe('parseDay', () => {
  it('parses as a local date', () => {
    const d = parseDay('2026-08-01')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(7)
    expect(d?.getDate()).toBe(1)
  })

  it('rejects malformed input', () => {
    expect(parseDay('')).toBeNull()
    expect(parseDay('aug 1')).toBeNull()
  })
})

describe('formatEventDate / formatEventDateRange', () => {
  it('formats a single day', () => {
    expect(formatEventDate('2026-08-01')).toBe('Aug 1, 2026')
  })

  it('collapses same-day ranges', () => {
    expect(formatEventDateRange('2026-08-01', '2026-08-01')).toBe('Aug 1, 2026')
    expect(formatEventDateRange('2026-08-01')).toBe('Aug 1, 2026')
  })

  it('compacts same-month ranges', () => {
    expect(formatEventDateRange('2026-08-01', '2026-08-03')).toBe('Aug 1–3, 2026')
  })

  it('spans months within a year', () => {
    expect(formatEventDateRange('2026-08-30', '2026-09-02')).toBe('Aug 30 – Sep 2, 2026')
  })

  it('spans years', () => {
    expect(formatEventDateRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027')
  })

  it('returns empty string on bad input', () => {
    expect(formatEventDateRange('nope')).toBe('')
  })
})

describe('eventCountdown', () => {
  it('counts down to the start', () => {
    expect(eventCountdown('2026-08-20', '2026-08-22', '2026-08-16')).toEqual({
      value: '4d',
      note: 'Starts Aug 20, 2026',
    })
  })

  it('says Today while in progress', () => {
    expect(eventCountdown('2026-08-15', '2026-08-17', '2026-08-16').value).toBe('Today')
    expect(eventCountdown('2026-08-16', undefined, '2026-08-16').value).toBe('Today')
  })

  it('says Wrapped after the end', () => {
    const r = eventCountdown('2026-08-01', '2026-08-03', '2026-08-16')
    expect(r.value).toBe('Wrapped')
    expect(r.note).toBe('Aug 1–3, 2026')
  })

  it('handles missing dates', () => {
    expect(eventCountdown('', undefined, '2026-08-16')).toEqual({ value: '—', note: 'No date set' })
  })
})
