import { describe, expect, it } from 'vitest'
import {
  EVENT_STATUS_TONE,
  FAMILY_LABEL,
  FAMILY_TONE,
  backPlanChips,
  bufferAssumptionLabel,
  eventCountdown,
  formatClockTime,
  formatEventDate,
  formatEventDateRange,
  parseDay,
  resolveJobTime,
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

// Canonical home of the shared time helpers (consolidated from event-spine so
// the brief and the runsheet anchor can never drift; event-spine re-exports).
describe('job time helpers', () => {
  it('formats 24h clock times', () => {
    expect(formatClockTime('14:00')).toBe('2:00 PM')
    expect(formatClockTime('00:30')).toBe('12:30 AM')
    expect(formatClockTime('12:05')).toBe('12:05 PM')
    expect(formatClockTime('9:15')).toBe('9:15 AM')
    expect(formatClockTime('25:00')).toBeNull()
    expect(formatClockTime('')).toBeNull()
  })

  it('resolves the honest time label by B7 precedence', () => {
    expect(resolveJobTime({ serviceStart: '2099-09-12T15:00', hoursStart: '14:00', firstItineraryTime: '13:30' }))
      .toEqual({ label: 'Service 3:00 PM', hhmm: '15:00', source: 'service' })
    expect(resolveJobTime({ hoursStart: '14:00', firstItineraryTime: '13:30' }))
      .toEqual({ label: 'Starts 2:00 PM', hhmm: '14:00', source: 'hours' })
    expect(resolveJobTime({ firstItineraryTime: '13:30' }))
      .toEqual({ label: 'First item 1:30 PM', hhmm: '13:30', source: 'itinerary' })
    expect(resolveJobTime({})).toBeNull()
  })

  it('back-plans pack/leave chips from the fixed default buffers', () => {
    expect(backPlanChips('14:00')).toEqual({ packBy: '12:45 PM', leaveBy: '1:30 PM' })
    // Crossing midnight backwards renders nonsense — suppressed instead.
    expect(backPlanChips('00:30')).toBeNull()
  })
})

describe('buffers (inc 2)', () => {
  it('falls back to the constants when unset or non-positive', () => {
    expect(bufferAssumptionLabel()).toBe('assumes 45m pack · 30m drive')
    expect(bufferAssumptionLabel({ pack_minutes: 0, drive_minutes: -5 })).toBe('assumes 45m pack · 30m drive')
  })

  it('uses org buffers in chips and label', () => {
    expect(bufferAssumptionLabel({ pack_minutes: 50, drive_minutes: 20 })).toBe('assumes 50m pack · 20m drive')
    expect(backPlanChips('14:00', { pack_minutes: 50, drive_minutes: 20 })).toEqual({
      packBy: '12:50 PM',
      leaveBy: '1:40 PM',
    })
  })

  it('keeps the default behavior with no buffers arg', () => {
    expect(backPlanChips('14:00')).toEqual({ packBy: '12:45 PM', leaveBy: '1:30 PM' })
  })

  it('still suppresses cross-midnight back-plans with custom buffers', () => {
    expect(backPlanChips('00:40', { pack_minutes: 30, drive_minutes: 20 })).toBeNull()
  })
})
