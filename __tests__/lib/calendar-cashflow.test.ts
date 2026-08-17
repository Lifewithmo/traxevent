import { describe, it, expect } from 'vitest'
import { buildRunway } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event } from '@/lib/types'

const TODAY = new Date('2026-08-16T00:00:00.000Z')

const evt = (over: Partial<Event>): Event => ({
  id: 'e', name: 'Job', slug: 'job', year: 2026, status: 'active', event_type_id: 'et',
  event_start: '2026-08-22', event_end: '2026-08-22', created_at: '2026-08-01T00:00:00.000Z',
  ...over,
}) as Event

const due = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date' | 'leadId' | 'amount'>): CalendarItem => ({
  title: 'Invoice', kind: 'invoice_due', href: '/acme/leads/x', ...over,
})

describe('buildRunway', () => {
  it('counts inflow only for receivables due on or before the booked job date', () => {
    const events = [evt({ id: 'j', name: 'Wedding', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [
      due({ id: 'before', leadId: 'L', amount: 1000, date: '2026-08-20' }),
      due({ id: 'after', leadId: 'L', amount: 500, date: '2026-08-25' }),
    ]
    const runway = buildRunway(items, events, TODAY)
    expect(runway).toHaveLength(1)
    expect(runway[0]).toMatchObject({ eventId: 'j', title: 'Wedding', date: '2026-08-22', inflowBefore: 1000, dueAfter: 500 })
  })

  it('anchors a multi-event lead’s receivable to its nearest future event', () => {
    const events = [
      evt({ id: 'near', lead_id: 'L', event_start: '2026-08-22' }),
      evt({ id: 'far', lead_id: 'L', event_start: '2026-09-30' }),
    ]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY)
    // ascending by event date
    expect(runway.map((r) => r.eventId)).toEqual(['near', 'far'])
    expect(runway.find((r) => r.eventId === 'near')!.inflowBefore).toBe(1000)
    expect(runway.find((r) => r.eventId === 'far')!.inflowBefore).toBe(0)
  })

  it('emits exactly the receivables-timing fields — never a cost/profit field', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY)
    expect(Object.keys(runway[0])).toEqual(['eventId', 'title', 'date', 'inflowBefore', 'dueAfter'])
  })

  it('lists only upcoming booked jobs (future/today), skipping past and archived events', () => {
    const events = [
      evt({ id: 'past', event_start: '2026-08-10' }),
      evt({ id: 'today', event_start: '2026-08-16' }),
      evt({ id: 'future', event_start: '2026-09-01' }),
      evt({ id: 'archived', event_start: '2026-08-30', status: 'archived' }),
    ]
    expect(buildRunway([], events, TODAY).map((r) => r.eventId)).toEqual(['today', 'future'])
  })

  it('counts a receivable due exactly ON the job date as inflow before (boundary, pins the <=)', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'on-date', leadId: 'L', amount: 900, date: '2026-08-22' })] // due == event_start
    const runway = buildRunway(items, events, TODAY)
    expect(runway[0].inflowBefore).toBe(900)
    expect(runway[0].dueAfter).toBe(0)
  })

  it('picks the nearest future event as anchor even when events arrive far-first (pins the ordering)', () => {
    // far event listed BEFORE the near one — a naive "first match wins" resolver would anchor to 9/30
    const events = [
      evt({ id: 'far', lead_id: 'L', event_start: '2026-09-30' }),
      evt({ id: 'near', lead_id: 'L', event_start: '2026-08-22' }),
    ]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY)
    expect(runway.find((r) => r.eventId === 'near')!.inflowBefore).toBe(1000)
    expect(runway.find((r) => r.eventId === 'far')!.inflowBefore).toBe(0)
  })

  it('still counts an overdue receivable as inflow before the job', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'overdue', leadId: 'L', amount: 700, date: '2026-08-05' })] // due before today
    expect(buildRunway(items, events, TODAY)[0].inflowBefore).toBe(700)
  })

  it('uses the LOCAL calendar date for "today", not the UTC date (Americas evening boundary)', () => {
    // A fake `now`: local components say the 16th, but toISOString() has already
    // rolled to the 17th (UTC) — exactly the several-hours-a-day window where an
    // Americas org would otherwise lose tonight's job off the runway.
    const now = {
      getFullYear: () => 2026,
      getMonth: () => 7, // August (0-based)
      getDate: () => 16,
      toISOString: () => '2026-08-17T02:00:00.000Z',
    } as unknown as Date
    const events = [evt({ id: 'tonight', event_start: '2026-08-16' })]
    // Local today (08-16) keeps the job upcoming; a UTC-derived today (08-17) would
    // treat it as past and drop it. Reverting to toISOString() breaks this.
    expect(buildRunway([], events, now).map((r) => r.eventId)).toEqual(['tonight'])
  })

  it('ignores non-invoice items, unlinked invoices, and invoices with no anchor event', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items: CalendarItem[] = [
      { id: 'ev', title: 'x', date: '2026-08-22', kind: 'event', href: '/x', bookedValue: 9 },
      due({ id: 'no-lead', leadId: undefined, amount: 400, date: '2026-08-20' }),
      due({ id: 'other-lead', leadId: 'Z', amount: 400, date: '2026-08-20' }),
    ]
    expect(buildRunway(items, events, TODAY)[0]).toMatchObject({ inflowBefore: 0, dueAfter: 0 })
  })
})
