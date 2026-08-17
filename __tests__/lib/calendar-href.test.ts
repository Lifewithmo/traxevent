import { describe, it, expect } from 'vitest'
import { calendarHref } from '@/lib/calendar-href'

describe('calendarHref', () => {
  it('builds the base calendar path with no params', () => {
    expect(calendarHref({ orgSlug: 'acme' })).toBe('/acme/calendar')
  })

  it('routes to the day segment when ymd is given', () => {
    expect(calendarHref({ orgSlug: 'acme', ymd: '2026-08-20' })).toBe('/acme/calendar/2026-08-20')
  })

  it('preserves view, week and kinds in a canonical order', () => {
    expect(
      calendarHref({ orgSlug: 'acme', view: 'month', week: '2026-08-17', kinds: 'pipeline' })
    ).toBe('/acme/calendar?view=month&week=2026-08-17&kinds=pipeline')
  })

  it('keeps every param when jumping to a specific day (the day-link case)', () => {
    expect(
      calendarHref({ orgSlug: 'acme', ymd: '2026-08-20', view: 'week', week: '2026-08-17', kinds: 'pipeline' })
    ).toBe('/acme/calendar/2026-08-20?view=week&week=2026-08-17&kinds=pipeline')
  })

  it('omits empty/undefined params rather than emitting bare keys', () => {
    expect(calendarHref({ orgSlug: 'acme', view: 'week', kinds: '' })).toBe('/acme/calendar?view=week')
  })
})
