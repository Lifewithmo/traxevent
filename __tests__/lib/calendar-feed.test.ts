import { describe, it, expect, vi } from 'vitest'
import { buildCalendarFeed, feedForDay, feedInRange, filterFeed, weekRange, weekDays, type CalendarItem, type CalendarFeedSources } from '@/lib/calendar'
import type { ComplianceDoc, Drop, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'

const listEventsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listLeadsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listComplianceDocsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listAllInvoicesCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listTasksCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listDropsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore: listLeadsCoreSpy }))
vi.mock('@/lib/ops/compliance', () => ({ listComplianceDocsCore: listComplianceDocsCoreSpy }))
vi.mock('@/lib/crm/invoices', () => ({ listAllInvoicesCore: listAllInvoicesCoreSpy }))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore: listTasksCoreSpy }))
vi.mock('@/lib/storefront/drops', () => ({ listDropsCore: listDropsCoreSpy }))

// Imported after the mocks above so assembleCalendarFeed's transitive core
// imports resolve to the spies instead of reaching firebase-admin for real.
import { assembleCalendarFeed } from '@/lib/calendar-feed'

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
const drop = (over: Partial<Drop>): Drop => ({
  id: 'd1', title: 'Weekend Drop', status: 'scheduled',
  opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z', timezone: 'UTC',
  pickup: {
    location_name: 'SW Boise',
    windows: [
      { id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' },
      { id: 'w2', day: '2026-08-23', start: '08:00', end: '10:00' },
      { id: 'w3', day: '2026-08-22', start: '15:00', end: '17:00' }, // same day → deduped
    ],
  },
  items: [], channels: [], created_at: 'x', ...over,
})

const empty: CalendarFeedSources = { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [] }

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
      drops: [],
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
      drops: [],
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

  it('market-day events carry their location as the detail line', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({
        id: 'm1', slug: 'bfm', name: 'Boise Farmers Market',
        kind: 'market_day', location: { name: 'Capitol Blvd' }, event_start: '2026-08-22', event_end: '2026-08-22',
      })],
    })
    const row = items.find((i) => i.id === 'm1')!
    expect(row.kind).toBe('event')
    expect(row.detail).toBe('Capitol Blvd')
  })

  it('emits one drop item per pickup window for scheduled drops, skipping drafts/archived', () => {
    const items = buildCalendarFeed('acme', { ...empty, drops: [drop({})] })
    const dropItems = items.filter((i) => i.kind === 'drop')
    // one item per WINDOW now (two windows share 2026-08-22), not per distinct day
    expect(dropItems).toHaveLength(3)
    expect(dropItems[0]).toMatchObject({
      date: '2026-08-22', title: 'Drop pickup: Weekend Drop',
      href: '/acme/drop-orders/d1', detail: 'SW Boise',
    })
    const draftItems = buildCalendarFeed('acme', { ...empty, drops: [drop({ status: 'draft' })] })
    expect(draftItems.filter((i) => i.kind === 'drop')).toHaveLength(0)
  })

  // ── Task 1: time projection onto event items + per-window drop times ──
  it('projects Event.hours onto event items as start/end', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({ id: 'e1', name: 'Wedding', event_start: '2026-08-22', event_end: '2026-08-22', hours: { start: '16:00', end: '21:00' } })],
    })
    const ev = items.find((i) => i.id === 'e1')!
    expect(ev.start).toBe('16:00')
    expect(ev.end).toBe('21:00')
  })

  it('leaves an event without hours time-less, so it falls to the all-day band', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({ id: 'e2', name: 'Job', event_start: '2026-08-22', event_end: '2026-08-22' })],
    })
    const ev = items.find((i) => i.id === 'e2')!
    expect(ev.start).toBeUndefined()
    expect(ev.end).toBeUndefined()
  })

  it('emits one drop item per window carrying that window start/end', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      drops: [drop({
        id: 'd9', title: 'Twin', pickup: {
          location_name: 'SW Boise',
          windows: [
            { id: 'a', day: '2026-08-18', start: '16:00', end: '18:00' },
            { id: 'b', day: '2026-08-18', start: '19:00', end: '20:00' },
          ],
        },
      })],
    })
    const dropItems = items.filter((i) => i.kind === 'drop')
    expect(dropItems).toHaveLength(2)
    expect(dropItems.map((i) => i.start).sort()).toEqual(['16:00', '19:00'])
    expect(dropItems.map((i) => i.end).sort()).toEqual(['18:00', '20:00'])
    expect(dropItems.map((i) => i.date)).toEqual(['2026-08-18', '2026-08-18'])
  })

  it('carries no time on date-only kinds (invoice_due, task, compliance, lead)', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      leads: [lead({ id: 'l', title: 'Wedding', event_date: '2026-08-20', stage: 'proposal' })],
      tasksByLeadId: { l: [task({ id: 't1', lead_id: 'l', due_date: '2026-08-20' })] },
      complianceDocs: [doc({ id: 'c1', expires_on: '2026-08-20' })],
      invoices: [invoice({ id: 'i1', due_date: '2026-08-20' })],
    })
    for (const kind of ['invoice_due', 'task', 'compliance', 'lead'] as const) {
      const it = items.find((i) => i.kind === kind)!
      expect(it.start).toBeUndefined()
      expect(it.end).toBeUndefined()
    }
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

  // ── Task 2: feedForDay pure filter ──
  it('feedForDay returns only that day’s items, comparing the date part', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({ id: 'e1', event_start: '2026-08-22', event_end: '2026-08-22' })],
      leads: [lead({ id: 'l1', event_date: '2026-08-23', stage: 'proposal' })],
    })
    expect(feedForDay(items, '2026-08-22').map((i) => i.id)).toEqual(['e1'])
    expect(feedForDay(items, '2026-08-23').map((i) => i.id)).toEqual(['l1'])

    const timed: CalendarItem = { id: 'x', title: 'X', date: '2026-08-22T18:00:00.000Z', kind: 'event', href: '/x' }
    expect(feedForDay([timed], '2026-08-22').map((i) => i.id)).toEqual(['x'])
  })

  it('feedForDay includes a multi-day event on every day it spans', () => {
    const items = buildCalendarFeed('acme', {
      ...empty,
      events: [event({ id: 'multi', event_start: '2026-08-21', event_end: '2026-08-23' })],
    })
    expect(items.find((i) => i.id === 'multi')!.endDate).toBe('2026-08-23')
    expect(feedForDay(items, '2026-08-20').map((i) => i.id)).toEqual([])
    expect(feedForDay(items, '2026-08-21').map((i) => i.id)).toEqual(['multi'])
    expect(feedForDay(items, '2026-08-22').map((i) => i.id)).toEqual(['multi']) // interior day
    expect(feedForDay(items, '2026-08-23').map((i) => i.id)).toEqual(['multi'])
    expect(feedForDay(items, '2026-08-24').map((i) => i.id)).toEqual([])
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

describe('assembleCalendarFeed', () => {
  it('fetches drops and passes them through into the feed', async () => {
    listDropsCoreSpy.mockResolvedValueOnce([drop({})])
    const items = await assembleCalendarFeed('org-1', 'acme')
    expect(listDropsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(items.filter((i) => i.kind === 'drop')).toHaveLength(3)
  })
})
