import { describe, it, expect } from 'vitest'
import { buildCalendarFeed, feedInRange, filterFeed, weekRange, weekDays, type CalendarFeedSources } from '@/lib/calendar'
import type { ComplianceDoc, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'

const event = (over: Partial<Event>): Event => ({
  id: 'e', name: 'Gala', slug: 'gala', year: 2026, status: 'active',
  registration_type: 'open' as Event['registration_type'], event_type_id: 'et1',
  features: { accommodations: false, teams: false, budget: false, itinerary: false, communicate: false },
  event_start: '2026-08-14', event_end: '2026-08-14', created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z', ...over,
})
const task = (over: Partial<Task>): Task => ({
  id: 't', lead_id: 'l', title: 'Call', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
})
const doc = (over: Partial<ComplianceDoc>): ComplianceDoc => ({
  id: 'd', name: 'Health permit', created_at: '2026-08-01T00:00:00.000Z', ...over,
})
const invoice = (over: Partial<NormalizedInvoice>): NormalizedInvoice => ({
  id: 'i', org_id: 'o1', lead_id: 'l', token: 'tok',
  type: 'final', lifecycle: 'sent', delivery: 'sent', accounting: 'not_connected', dispute: 'none',
  line_items: [{ description: 'Bar service', quantity: 1, unit_price: 1500 }],
  payments: [], due_date: '2026-08-12', created_at: '2026-08-01T00:00:00.000Z', ...over,
})

const empty: CalendarFeedSources = { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [] }

describe('buildCalendarFeed', () => {
  it('produces all six kinds, date-sorted', () => {
    const l1 = lead({ id: 'l1', title: 'Wedding', event_date: '2026-08-15', stage: 'proposal' })
    const l2 = lead({ id: 'l2', title: 'Offsite', stage: 'consultation', waiting: { reason: 'budget', follow_up_date: '2026-08-13' } })
    const items = buildCalendarFeed('acme', {
      events: [event({})],
      leads: [l1, l2],
      tasksByLeadId: { l2: [task({ id: 't1', lead_id: 'l2', due_date: '2026-08-11' })] },
      complianceDocs: [doc({ expires_on: '2026-08-10' })],
      invoices: [invoice({})],
    })
    expect(items.map((i) => i.kind)).toEqual(['compliance', 'task', 'invoice_due', 'follow_up', 'event', 'lead'])
  })

  it('a converted opportunity shows as its event only', () => {
    const won = lead({ id: 'lw', stage: 'closed_won', event_date: '2026-08-14' })
    const items = buildCalendarFeed('acme', { ...empty, events: [event({ lead_id: 'lw' })], leads: [won] })
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('event')
  })

  it('skips archived events, lost leads, done and undated tasks', () => {
    const items = buildCalendarFeed('acme', {
      events: [event({ status: 'archived' })],
      leads: [lead({ id: 'lost', stage: 'closed_lost', event_date: '2026-08-20' }), lead({ id: 'l' })],
      tasksByLeadId: { l: [task({ id: 'done', due_date: '2026-08-12', done: true }), task({ id: 'undated' })] },
      complianceDocs: [doc({})], // no expiry
      invoices: [invoice({ lifecycle: 'draft' })],
    })
    expect(items).toHaveLength(0)
  })

  it('marks a compliance expiry as a blocker naming the next booked event after it', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({ event_start: '2026-08-14' })],
      complianceDocs: [doc({ id: 'blocks', expires_on: '2026-08-12' }), doc({ id: 'clear', expires_on: '2026-08-20' })],
    })
    const blocks = items.find((i) => i.id === 'blocks')!
    expect(blocks.blocker).toBe(true)
    expect(blocks.detail).toBe('blocks Gala')
    expect(items.find((i) => i.id === 'clear')!.blocker).toBe(false)
  })

  it('invoice dues carry the outstanding balance and skip settled invoices', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      leads: [lead({ id: 'l', title: 'Wedding' })],
      invoices: [
        invoice({ id: 'due' }),
        invoice({ id: 'paid', payments: [{ amount: 1500, recorded_at: '2026-08-01T00:00:00.000Z' }] }),
      ],
    })
    expect(items.map((i) => i.id)).toEqual(['due'])
    expect(items[0].amount).toBe(1500)
    expect(items[0].detail).toBe('Wedding')
  })

  it('tentative holds say why they are on the calendar', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      leads: [
        lead({ id: 'open', stage: 'proposal', event_date: '2026-08-15' }),
        lead({ id: 'won', stage: 'closed_won', event_date: '2026-08-16' }),
      ],
    })
    expect(items.find((i) => i.id === 'open')!.detail).toBe('not booked')
    expect(items.find((i) => i.id === 'won')!.detail).toBe('won · not scheduled')
    expect(items.every((i) => i.tentative)).toBe(true)
  })
})

describe('week helpers', () => {
  it('weekRange snaps any day to its Monday-start week', () => {
    expect(weekRange('2026-08-12')).toEqual({ from: '2026-08-10', to: '2026-08-16' }) // Wednesday
    expect(weekRange('2026-08-10')).toEqual({ from: '2026-08-10', to: '2026-08-16' }) // Monday
    expect(weekRange('2026-08-16')).toEqual({ from: '2026-08-10', to: '2026-08-16' }) // Sunday
  })

  it('weekDays lists the seven days from Monday', () => {
    const days = weekDays('2026-08-10')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-08-10')
    expect(days[6]).toBe('2026-08-16')
  })

  it('filterFeed and feedInRange narrow without reordering', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({})],
      leads: [lead({ id: 'l1', event_date: '2026-09-01', stage: 'proposal' })],
    })
    expect(filterFeed(items, ['event']).map((i) => i.kind)).toEqual(['event'])
    expect(feedInRange(items, '2026-08-10', '2026-08-16')).toHaveLength(1)
  })
})
