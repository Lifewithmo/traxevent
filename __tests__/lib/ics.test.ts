import { describe, it, expect } from 'vitest'
import { buildIcs, icsEscape } from '@/lib/ics'
import type { CalendarItem } from '@/lib/calendar'

const now = new Date('2026-08-09T12:00:00.000Z')

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: 'x', title: 'Gala', date: '2026-08-14', kind: 'event', href: '/acme/gala/dashboard', ...over,
})

describe('icsEscape', () => {
  it('escapes backslash first, then structural characters', () => {
    expect(icsEscape('a\\b;c,d')).toBe('a\\\\b\\;c\\,d')
    expect(icsEscape('line1\nline2')).toBe('line1\\nline2')
  })
})

describe('buildIcs', () => {
  it('emits a valid all-day VEVENT with exclusive DTEND', () => {
    const ics = buildIcs([item({})], 'BrewTrax — TraxEvent', now)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('X-WR-CALNAME:BrewTrax — TraxEvent')
    expect(ics).toContain('UID:event-x@traxevent')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260814')
    expect(ics).toContain('DTEND;VALUE=DATE:20260815')
    expect(ics).toContain('SUMMARY:Gala')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('marks tentative holds and appends invoice amounts to the summary', () => {
    const ics = buildIcs(
      [
        item({ id: 'h', kind: 'lead', tentative: true, title: 'Wedding hold' }),
        item({ id: 'i', kind: 'invoice_due', title: 'Final invoice', amount: 1567.5 }),
      ],
      'Feed',
      now
    )
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('SUMMARY:Final invoice — $1\\,567.5')
  })

  it('kind and detail land in the description', () => {
    const ics = buildIcs([item({ kind: 'compliance', title: 'Permit expires', detail: 'blocks Gala' })], 'Feed', now)
    expect(ics).toContain('DESCRIPTION:Compliance · blocks Gala')
  })

  it('folds lines longer than 75 octets', () => {
    const long = 'A'.repeat(100)
    const ics = buildIcs([item({ title: long })], 'Feed', now)
    const summaryLine = ics.split('\r\n').find((l) => l.startsWith('SUMMARY:'))!
    expect(summaryLine.length).toBeLessThanOrEqual(75)
    expect(ics).toContain('\r\n A') // continuation line
  })

  it('emits distinct TIMED VEVENTs for two drop windows on the same day', () => {
    const ics = buildIcs(
      [
        item({ id: 'd1:w1', kind: 'drop', title: 'Drop pickup: Weekend', date: '2026-08-18', start: '16:00', end: '18:00' }),
        item({ id: 'd1:w2', kind: 'drop', title: 'Drop pickup: Weekend', date: '2026-08-18', start: '19:00', end: '20:00' }),
      ],
      'Feed',
      now
    )
    // real timed DTSTART/DTEND (not VALUE=DATE), one pair per window
    expect(ics).toContain('DTSTART:20260818T160000')
    expect(ics).toContain('DTEND:20260818T180000')
    expect(ics).toContain('DTSTART:20260818T190000')
    expect(ics).toContain('DTEND:20260818T200000')
    // the two windows are distinguishable timed entries, not identical all-day blocks
    const starts = ics.split('\r\n').filter((l) => l.startsWith('DTSTART'))
    expect(starts).toEqual(['DTSTART:20260818T160000', 'DTSTART:20260818T190000'])
    expect(ics).not.toContain('DTSTART;VALUE=DATE') // timed items never fall back to all-day
    expect(ics).toContain('UID:drop-d1:w1@traxevent')
    expect(ics).toContain('UID:drop-d1:w2@traxevent')
  })

  it('uses stable UIDs so calendar apps update instead of duplicating', () => {
    const a = buildIcs([item({ id: 'same', kind: 'task' })], 'Feed', now)
    const b = buildIcs([item({ id: 'same', kind: 'task', title: 'Renamed' })], 'Feed', now)
    const uid = (s: string) => s.split('\r\n').find((l) => l.startsWith('UID:'))
    expect(uid(a)).toBe('UID:task-same@traxevent')
    expect(uid(a)).toBe(uid(b))
  })
})
