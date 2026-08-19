import { describe, it, expect } from 'vitest'
import {
  buildCalendarFeed,
  buildUnscheduled,
  isDerived,
  type CalendarFeedSources,
  type CalendarItem,
} from '@/lib/calendar'
import { DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import type { ComplianceDoc, Drop, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'

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
    windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }],
  },
  items: [], channels: [], created_at: 'x', ...over,
})

const empty: CalendarFeedSources = { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [] }

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: 'x', title: 'Thing', date: '2026-08-14', kind: 'event', href: '/acme/x', ...over,
})

describe('isDerived', () => {
  it('is false for a fact read from a document', () => {
    expect(isDerived(item({}))).toBe(false)
    // every item buildCalendarFeed produces is a fact, never a verdict
    const facts = buildCalendarFeed('acme', { ...empty, events: [event({})], leads: [lead({ event_date: '2026-08-15' })] })
    expect(facts.every((i) => !isDerived(i))).toBe(true)
  })

  it('is true once an item carries its provenance', () => {
    const verdict = item({
      derived: {
        rule: 'capacity.over',
        inputs: { needed: 2, available: 1 },
        reason: 'Two jobs need the cart and you have one.',
        fixHref: '/acme/settings/capacity',
      },
    })
    expect(isDerived(verdict)).toBe(true)
    expect(verdict.derived!.rule).toBe('capacity.over')
    expect(verdict.derived!.inputs.needed).toBe(2)
  })
})

describe('buildUnscheduled', () => {
  it('returns [] for empty sources', () => {
    expect(buildUnscheduled('acme', empty)).toEqual([])
  })

  it('includes an undated open opportunity and excludes a dated one', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      leads: [
        lead({ id: 'undated', title: 'Backyard wedding', stage: 'proposal', estimated_value: 4000 }),
        lead({ id: 'dated', title: 'Corporate gala', stage: 'proposal', event_date: '2026-09-12' }),
      ],
    })
    expect(rows.map((r) => r.id)).toEqual(['undated'])
    expect(rows[0]).toMatchObject({
      title: 'Backyard wedding', kind: 'lead', href: '/acme/leads/undated',
      value: 4000, leadId: 'undated', createdAt: '2026-08-01T00:00:00.000Z',
    })
    expect(rows[0].bookByDate).toBeUndefined()
  })

  it('excludes lost and closed opportunities, and archived events', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      events: [event({ id: 'gone', status: 'archived', event_start: '' })],
      leads: [
        lead({ id: 'lost', stage: 'closed_lost' }),
        lead({ id: 'won', stage: 'closed_won' }),
        lead({ id: 'live', stage: 'inquiry' }),
      ],
    })
    expect(rows.map((r) => r.id)).toEqual(['live'])
  })

  it('excludes an undated opportunity that already owns a dated job', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      events: [event({ id: 'ev', lead_id: 'scheduled', event_start: '2026-08-14' })],
      leads: [lead({ id: 'scheduled', stage: 'proposal' })],
    })
    expect(rows).toEqual([])
  })

  it('lists an undated job once — as the event, never doubled with its opportunity', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      events: [event({ id: 'ev', slug: 'gala', lead_id: 'src', event_start: '', event_end: '' })],
      leads: [lead({ id: 'src', stage: 'proposal', estimated_value: 7000 })],
    })
    expect(rows.map((r) => r.id)).toEqual(['ev'])
    expect(rows[0]).toMatchObject({ kind: 'event', href: '/acme/gala/dashboard', leadId: 'src', value: 7000 })
  })

  it('takes an undated job’s book-by from its opportunity’s promised date, minus prep lead days', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      // payment_amount/booth_fee are decoys: money comes from the lead only
      events: [event({ id: 'ev', lead_id: 'src', event_start: '', payment_amount: 150, booth_fee: 40 })],
      leads: [lead({ id: 'src', stage: 'proposal', event_date: '2026-09-12', estimated_value: 3000 })],
    })
    expect(DEFAULT_PREP_LEAD_DAYS).toBe(14)
    expect(rows[0].bookByDate).toBe('2026-08-29') // 2026-09-12 − 14d
    expect(rows[0].value).toBe(3000)
  })

  it('ranks a real book-by deadline above pure value, then value, then age, then id', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      events: [event({ id: 'deadline', lead_id: 'promised', event_start: '' })],
      leads: [
        lead({ id: 'promised', stage: 'proposal', event_date: '2026-09-12', estimated_value: 100 }),
        lead({ id: 'big', stage: 'proposal', estimated_value: 9000 }),
        lead({ id: 'small', stage: 'inquiry', estimated_value: 500 }),
        // same value as `small`: older created_at wins the tie
        lead({ id: 'older', stage: 'inquiry', estimated_value: 500, created_at: '2026-07-01T00:00:00.000Z' }),
      ],
    })
    expect(rows.map((r) => r.id)).toEqual(['deadline', 'big', 'older', 'small'])
  })

  it('breaks a full tie on id so the order is deterministic', () => {
    const same = { stage: 'inquiry' as const, estimated_value: 500, created_at: '2026-08-01T00:00:00.000Z' }
    const forward = buildUnscheduled('acme', { ...empty, leads: [lead({ id: 'a', ...same }), lead({ id: 'b', ...same })] })
    const reversed = buildUnscheduled('acme', { ...empty, leads: [lead({ id: 'b', ...same }), lead({ id: 'a', ...same })] })
    expect(forward.map((r) => r.id)).toEqual(['a', 'b'])
    expect(reversed.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('treats a valueless opportunity as zero rather than dropping it', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      leads: [lead({ id: 'novalue', stage: 'inquiry' }), lead({ id: 'valued', stage: 'inquiry', estimated_value: 1 })],
    })
    expect(rows.map((r) => r.id)).toEqual(['valued', 'novalue'])
    expect(rows[1].value).toBeUndefined()
  })

  it('frees an opportunity again when its only job is archived', () => {
    const rows = buildUnscheduled('acme', {
      ...empty,
      events: [event({ id: 'ev', lead_id: 'src', status: 'archived', event_start: '2026-08-14' })],
      leads: [lead({ id: 'src', stage: 'proposal' })],
    })
    expect(rows.map((r) => r.id)).toEqual(['src'])
  })
})

// The ICS feed, the cockpit and several suites read buildCalendarFeed. Adding
// the provenance channel and buildUnscheduled must not move a single byte of it.
describe('buildCalendarFeed is unchanged by the provenance + unscheduled work', () => {
  const mixed: CalendarFeedSources = {
    events: [
      event({ id: 'ev', lead_id: 'won', event_start: '2026-08-14', event_end: '2026-08-14', headcount: 60 }),
      event({ id: 'undated', slug: 'ghost', event_start: '', event_end: '' }),
      event({ id: 'archived', status: 'archived', event_start: '2026-08-16' }),
    ],
    leads: [
      lead({ id: 'won', stage: 'closed_won', estimated_value: 12000, event_date: '2026-08-14' }),
      lead({ id: 'hold', title: 'Wedding', stage: 'proposal', event_date: '2026-08-15' }),
      lead({ id: 'undatedLead', title: 'Offsite', stage: 'consultation', estimated_value: 2500 }),
      lead({ id: 'lost', stage: 'closed_lost', event_date: '2026-08-18' }),
    ],
    tasksByLeadId: { hold: [task({ id: 't1', lead_id: 'hold', due_date: '2026-08-11' }), task({ id: 't2', lead_id: 'hold' })] },
    complianceDocs: [doc({ id: 'permit', expires_on: '2026-08-10' })],
    invoices: [invoice({ id: 'i1', lead_id: 'hold' })],
    drops: [drop({})],
  }

  it('produces exactly the same items, in the same order, with no derived marks', () => {
    const items = buildCalendarFeed('acme', mixed)
    expect(items).toEqual([
      { id: 'permit', title: 'Health permit expires', date: '2026-08-10', kind: 'compliance', href: '/acme/compliance', blocker: true, detail: 'blocks Gala' },
      { id: 't1', title: 'Call', date: '2026-08-11', kind: 'task', href: '/acme/leads/hold', detail: 'Wedding' },
      { id: 'i1', title: 'Invoice', date: '2026-08-12', kind: 'invoice_due', href: '/acme/leads/hold', amount: 1500, detail: 'Wedding', leadId: 'hold' },
      { id: 'ev', title: 'Gala', date: '2026-08-14', kind: 'event', href: '/acme/gala/dashboard', detail: '60 guests', headcount: 60, bookedValue: 12000 },
      { id: 'hold', title: 'Wedding', date: '2026-08-15', kind: 'lead', href: '/acme/leads/hold', tentative: true, detail: 'not booked' },
      { id: 'd1:w1', title: 'Drop pickup: Weekend Drop', date: '2026-08-22', kind: 'drop', href: '/acme/drop-orders/d1', detail: 'SW Boise', start: '08:00', end: '11:00' },
    ])
    expect(items.some(isDerived)).toBe(false)
  })

  it('leaves the undated work it drops to buildUnscheduled, with no overlap', () => {
    const dated = buildCalendarFeed('acme', mixed).map((i) => i.id)
    const undated = buildUnscheduled('acme', mixed).map((i) => i.id)
    // the $2,500 opportunity outranks a valueless orphan job with no book-by
    expect(undated).toEqual(['undatedLead', 'undated'])
    expect(dated.filter((id) => undated.includes(id))).toEqual([])
  })
})
