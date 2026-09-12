import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalendarFeedSources } from '@/lib/calendar'

const listEventsSpy = vi.hoisted(() => vi.fn())
const listLeadsSpy = vi.hoisted(() => vi.fn())
const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))
const listEventsCoreSpy = vi.hoisted(() => vi.fn())
const listLeadsCoreSpy = vi.hoisted(() => vi.fn())
const listTasksCoreSpy = vi.hoisted(() => vi.fn())
const listAllProposalsSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
// The shared, request-memoised source layer the cockpit actions now read through.
const loadCalendarSourcesSpy = vi.hoisted(() => vi.fn())

vi.mock('@/actions/events', () => ({ listEvents: listEventsSpy }))
vi.mock('@/actions/leads', () => ({ listLeads: listLeadsSpy }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy }))
vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore: listLeadsCoreSpy }))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore: listTasksCoreSpy }))
vi.mock('@/actions/proposals', () => ({ listAllProposals: listAllProposalsSpy }))
// Both reach firebase-admin at import time.
vi.mock('@/lib/calendar-feed', () => ({ assembleCalendarFeed: vi.fn() }))
vi.mock('@/lib/calendar-fetch', () => ({ loadCalendarSources: loadCalendarSourcesSpy }))

import { getDayDetail, getOrgCalendar, listCalendarRange } from '@/actions/calendar'

/** The shape loadCalendarSources resolves to; every field defaults to empty.
 *  Fixtures below carry only the fields the assertion needs, so the overrides
 *  are widened once here rather than cast at every call site. */
function sources(over: Record<string, unknown> = {}): CalendarFeedSources {
  const base = { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [] }
  return { ...base, ...over } as unknown as CalendarFeedSources
}

describe('getOrgCalendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership then returns the merged, date-sorted calendar', async () => {
    listEventsSpy.mockResolvedValue([
      { id: 'c1', name: 'Spring Gathering', slug: 'spring-gathering', event_start: '2026-07-10' },
    ])
    listLeadsSpy.mockResolvedValue([
      { id: 'l1', name: 'Acme Wedding', stage: 'inquiry', event_date: '2026-07-05', created_at: 'x' },
    ])

    const items = await getOrgCalendar('org-1', 'my-org')

    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsSpy).toHaveBeenCalledWith('org-1')
    expect(listLeadsSpy).toHaveBeenCalledWith('org-1')
    expect(items.map((i) => i.id)).toEqual(['l1', 'c1'])
    expect(items.map((i) => i.kind)).toEqual(['lead', 'event'])
    expect(items[0].href).toBe('/my-org/leads/l1')
    expect(items[1].href).toBe('/my-org/spring-gathering/dashboard')
  })
})

describe('listCalendarRange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership, fetches tasks only for open-stage leads in parallel, and returns the merged range', async () => {
    listEventsCoreSpy.mockResolvedValue([])
    listLeadsCoreSpy.mockResolvedValue([
      { id: 'l1', name: 'Open Lead', stage: 'inquiry', created_at: 'x' },
      { id: 'l2', name: 'Closed Lead', stage: 'closed_won', created_at: 'x' },
    ])
    listTasksCoreSpy.mockResolvedValue([
      { id: 't1', lead_id: 'l1', title: 'Follow up', done: false, due_date: '2026-08-10', created_at: 'x' },
    ])

    const items = await listCalendarRange('org-1', 'my-org', '2026-08-01', '2026-08-31')

    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listLeadsCoreSpy).toHaveBeenCalledWith('org-1')
    // Tasks are fetched per open lead only — never for the closed-stage lead.
    expect(listTasksCoreSpy).toHaveBeenCalledTimes(1)
    expect(listTasksCoreSpy).toHaveBeenCalledWith('org-1', 'l1')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['task:t1'])
  })

  // Pins WHY the events read here stays unbounded. buildCalendar suppresses a
  // lead's tentative hold using the lead_ids of the events it is handed, so a
  // windowed events read would resurrect the hold of any opportunity whose job
  // is booked outside the window — inventing a row rather than saving one.
  it('suppresses the hold of a lead converted to an event OUTSIDE the requested range', async () => {
    listEventsCoreSpy.mockResolvedValue([
      // booked in December; the lead's own event_date is stale at August 5th
      { id: 'ev-dec', name: 'Rescheduled Gala', slug: 'gala', status: 'active', lead_id: 'L',
        event_start: '2026-12-01', event_end: '2026-12-01' },
    ])
    listLeadsCoreSpy.mockResolvedValue([
      { id: 'L', name: 'Nguyen', stage: 'closed_won', event_date: '2026-08-05', created_at: 'x' },
    ])
    listTasksCoreSpy.mockResolvedValue([])

    const items = await listCalendarRange('org-1', 'my-org', '2026-08-01', '2026-08-31')

    expect(items.filter((i) => i.kind === 'lead')).toEqual([])
  })
})

describe('getDayDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership and joins the day’s events to their proposals + invoices', async () => {
    loadCalendarSourcesSpy.mockResolvedValue(
      sources({
        events: [
          { id: 'ev1', name: 'Wedding', slug: 'wedding', status: 'active', lead_id: 'L',
            event_start: '2026-08-22', event_end: '2026-08-22' },
          { id: 'other', name: 'Later Job', slug: 'later', status: 'active', lead_id: 'M',
            event_start: '2026-09-01', event_end: '2026-09-01' },
        ],
        leads: [{ id: 'L', name: 'Nguyen', stage: 'closed_won', estimated_value: 12000, created_at: 'x' }],
        invoices: [
          { id: 'inv1', org_id: 'o', lead_id: 'L', token: 't', type: 'final', lifecycle: 'sent',
            delivery: 'sent', accounting: 'not_connected', dispute: 'none', line_items: [], payments: [],
            due_date: '2026-08-25', created_at: 'x' },
        ],
      })
    )
    listAllProposalsSpy.mockResolvedValue([
      { id: 'p1', org_id: 'o', lead_id: 'L', token: 't', status: 'accepted', line_items: [], created_at: 'x' },
    ])

    const detail = await getDayDetail('org-1', 'acme', '2026-08-22')

    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    expect(detail.ymd).toBe('2026-08-22')
    expect(detail.events.map((e) => e.id)).toEqual(['ev1']) // only that day's event
    expect(detail.related['ev1'].job?.id).toBe('L')
    expect(detail.related['ev1'].proposals.map((p) => p.id)).toEqual(['p1'])
    expect(detail.related['ev1'].invoices.map((i) => i.id)).toEqual(['inv1'])
  })

  it('returns empty events/related for a day with nothing booked', async () => {
    loadCalendarSourcesSpy.mockResolvedValue(sources())
    const detail = await getDayDetail('org-1', 'acme', '2026-08-22')
    expect(detail.events).toEqual([])
    expect(detail.related).toEqual({})
    expect(detail.tasks).toEqual([])
    expect(detail.blockers).toEqual([])
    expect(detail.drops).toEqual([])
    expect(detail.invoicesDue).toEqual([])
  })

  it('surfaces drops landing on the day through the shared sources (not silently empty)', async () => {
    loadCalendarSourcesSpy.mockResolvedValue(
      sources({
        drops: [
          { id: 'drop1', title: 'Weekend', status: 'scheduled', opens_at: 'x', closes_at: 'x', timezone: 'UTC',
            pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '16:00', end: '18:00' }] },
            items: [], channels: [], created_at: 'x' },
        ],
      })
    )
    const detail = await getDayDetail('org-1', 'acme', '2026-08-22')
    expect(detail.drops.map((d) => d.id)).toEqual(['drop1:w1'])
    expect(detail.drops[0].start).toBe('16:00')
  })

  it('reads the request-shared sources rather than re-fanning out over the collections', async () => {
    loadCalendarSourcesSpy.mockResolvedValue(sources())
    await getDayDetail('org-1', 'acme', '2026-08-22')
    // Unbounded on purpose: the same request's layout renders the whole feed, so
    // a narrower window would miss that cache entry and fork a second fan-out.
    expect(loadCalendarSourcesSpy).toHaveBeenCalledTimes(1)
    expect(loadCalendarSourcesSpy).toHaveBeenCalledWith('org-1', null, null)
  })

  // ── The verified contradiction: a week cell showed an amber balance chip on a
  // day whose spine said "Nothing scheduled", because getDayDetail dropped the
  // invoice_due kind on the floor. Both surfaces derive from the same feed.
  it('returns the day’s invoice_due items with their outstanding balance', async () => {
    loadCalendarSourcesSpy.mockResolvedValue(
      sources({
        leads: [{ id: 'L', name: 'Nguyen', title: 'Rooftop Wedding', stage: 'closed_won', created_at: 'x' }],
        invoices: [
          { id: 'inv-due', org_id: 'o', lead_id: 'L', token: 't', type: 'final', lifecycle: 'sent',
            delivery: 'sent', accounting: 'not_connected', dispute: 'none',
            line_items: [{ description: 'Bar service', quantity: 1, unit_price: 4200 }], payments: [],
            due_date: '2026-08-22', created_at: 'x' },
          // a different day — must not leak into this day's spine
          { id: 'inv-later', org_id: 'o', lead_id: 'L', token: 't', type: 'final', lifecycle: 'sent',
            delivery: 'sent', accounting: 'not_connected', dispute: 'none',
            line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }], payments: [],
            due_date: '2026-08-25', created_at: 'x' },
        ],
      })
    )

    const detail = await getDayDetail('org-1', 'acme', '2026-08-22')

    expect(detail.invoicesDue.map((i) => i.id)).toEqual(['inv-due'])
    expect(detail.invoicesDue[0].kind).toBe('invoice_due')
    expect(detail.invoicesDue[0].amount).toBe(4200)
    // and the day is no longer indistinguishable from an empty one
    expect(detail.events).toEqual([])
    expect(detail.invoicesDue).toHaveLength(1)
  })
})
