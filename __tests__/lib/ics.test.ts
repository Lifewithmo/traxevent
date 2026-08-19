import { describe, it, expect, afterEach, vi } from 'vitest'
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

  it('exports a multi-day event as a span with exclusive DTEND (endDate + 1)', () => {
    const ics = buildIcs([item({ date: '2026-08-14', endDate: '2026-08-16' })], 'Cal', now)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260814')
    // exclusive end: the day AFTER the last spanned day (08-16 → 08-17)
    expect(ics).toContain('DTEND;VALUE=DATE:20260817')
    expect(ics).not.toContain('DTEND;VALUE=DATE:20260815')
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

  // The crew feed's whole job on a phone: a tappable address and a way back in.
  // vitest.config pins NEXT_PUBLIC_APP_ORIGIN, so the "unset" case stubs it off.
  describe('LOCATION / URL', () => {
    afterEach(() => vi.unstubAllEnvs())

    const line = (ics: string, prefix: string) => ics.split('\r\n').filter((l) => l.startsWith(prefix))

    it('emits LOCATION when the item carries a place, RFC-5545 escaped', () => {
      const ics = buildIcs([item({ location: 'Boise Farmers Market, 10 S 8th St, Boise, ID' })], 'Feed', now)
      // commas escape exactly like SUMMARY/DESCRIPTION
      expect(ics).toContain('LOCATION:Boise Farmers Market\\, 10 S 8th St\\, Boise\\, ID')
    })

    it('omits LOCATION entirely — not an empty line — when the item has no place', () => {
      const ics = buildIcs([item({})], 'Feed', now)
      expect(line(ics, 'LOCATION')).toEqual([])
      expect(ics).not.toContain('LOCATION:')
    })

    it('folds a LOCATION longer than 75 octets like every other text line', () => {
      const ics = buildIcs([item({ location: 'B'.repeat(100) })], 'Feed', now)
      const first = line(ics, 'LOCATION:')[0]
      expect(first.length).toBeLessThanOrEqual(75)
      expect(ics).toContain('\r\n B')
    })

    it('emits URL resolved against NEXT_PUBLIC_APP_ORIGIN', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', 'https://app.traxevent.com')
      const ics = buildIcs([item({ href: '/acme/gala/dashboard' })], 'Feed', now)
      expect(ics).toContain('URL:https://app.traxevent.com/acme/gala/dashboard')
    })

    it('omits URL entirely when the origin is unset — never a relative link', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', '')
      const ics = buildIcs([item({ href: '/acme/gala/dashboard', location: 'Somewhere' })], 'Feed', now)
      expect(line(ics, 'URL')).toEqual([])
      expect(ics).not.toContain('URL:')
      // LOCATION is independent of the origin and still lands
      expect(ics).toContain('LOCATION:Somewhere')
    })

    it('leaves the URL unescaped (URI value type) while still folding a long one', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', 'https://app.traxevent.com')
      const ics = buildIcs([item({ href: `/acme/${'d'.repeat(80)}/dashboard` })], 'Feed', now)
      const parts = line(ics, 'URL:')
      expect(parts[0].length).toBeLessThanOrEqual(75)
      // unfolding restores the exact absolute URL — no backslashes introduced
      expect(ics.split('\r\n').filter((l) => l.startsWith('URL:') || l.startsWith(' d')).join('').replace(/^URL:/, '').replace(/ /g, ''))
        .toBe(`https://app.traxevent.com/acme/${'d'.repeat(80)}/dashboard`)
      expect(ics).not.toContain('URL:https://app.traxevent.com\\')
    })
  })

  it('uses stable UIDs so calendar apps update instead of duplicating', () => {
    const a = buildIcs([item({ id: 'same', kind: 'task' })], 'Feed', now)
    const b = buildIcs([item({ id: 'same', kind: 'task', title: 'Renamed' })], 'Feed', now)
    const uid = (s: string) => s.split('\r\n').find((l) => l.startsWith('UID:'))
    expect(uid(a)).toBe('UID:task-same@traxevent')
    expect(uid(a)).toBe(uid(b))
  })
})
