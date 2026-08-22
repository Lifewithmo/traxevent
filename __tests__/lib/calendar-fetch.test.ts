import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Event } from '@/lib/types'

/**
 * The cockpit's source layer: does one request really fan out ONCE, is the auth
 * assertion still in front of every entry point, and does the span-aware
 * bounding keep the multi-day event that starts before the window?
 *
 * React's `cache()` only memoises when an RSC cache dispatcher is active — in
 * the default (client) react build vitest resolves, `cache(fn)` is a bare
 * pass-through. So a dedupe test that used the real `cache()` would assert
 * nothing at all. We substitute a real per-scope memoiser below, and
 * `requestScope.reset()` ends the simulated request.
 */
const requestScope = vi.hoisted(() => {
  const store = new Map<unknown, Map<string, unknown>>()
  return {
    reset: () => store.clear(),
    cache: <T extends (...args: never[]) => unknown>(fn: T): T =>
      ((...args: never[]) => {
        let perFn = store.get(fn)
        if (!perFn) { perFn = new Map(); store.set(fn, perFn) }
        const key = JSON.stringify(args)
        if (!perFn.has(key)) perFn.set(key, fn(...args))
        return perFn.get(key)
      }) as T,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: requestScope.cache }
})

// ── source fetchers, spied so we can COUNT the reads ─────────────────────────
const listEventsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listLeadsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listComplianceDocsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listAllInvoicesCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listTasksCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listDropsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const eventsRefSpy = vi.hoisted(() => vi.fn())
const invoicesRefSpy = vi.hoisted(() => vi.fn())
const complianceDocsRefSpy = vi.hoisted(() => vi.fn())
const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))
const listAllProposalsSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy, eventsRef: eventsRefSpy }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore: listLeadsCoreSpy }))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore: listTasksCoreSpy }))
vi.mock('@/lib/crm/invoices', () => ({ listAllInvoicesCore: listAllInvoicesCoreSpy, invoicesRef: invoicesRefSpy }))
vi.mock('@/lib/ops/compliance', () => ({
  listComplianceDocsCore: listComplianceDocsCoreSpy,
  complianceDocsRef: complianceDocsRefSpy,
}))
vi.mock('@/lib/storefront/drops', () => ({ listDropsCore: listDropsCoreSpy }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy }))
vi.mock('@/actions/proposals', () => ({ listAllProposals: listAllProposalsSpy }))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: {}, adminAuth: {}, adminBucket: {} }))

import {
  loadCalendarEvents,
  loadCalendarSources,
  orgCalendarFeed,
  orgEvents,
  orgUnscheduled,
} from '@/lib/calendar-fetch'
import { assembleCalendarFeed } from '@/lib/calendar-feed'
import { getCalendarFeed, getDayDetail } from '@/actions/calendar'

/**
 * A minimal stand-in for a Firestore CollectionReference. Two properties matter
 * and both are load-bearing for the code under test:
 *   • `.where()` is IMMUTABLE — it returns a new query — so two chains branched
 *     off one ref cannot pollute each other's filters.
 *   • a range filter EXCLUDES a document that lacks the field. That is exactly
 *     why the span query is split in two, so the fake must model it.
 */
function fakeCollection(rows: Array<Record<string, unknown>>) {
  const build = (filters: Array<[string, string, string]>) => ({
    where: (field: string, op: string, value: string) => build([...filters, [field, op, value]]),
    get: async () => ({
      docs: rows
        .filter((row) =>
          filters.every(([field, op, value]) => {
            const actual = row[field]
            if (typeof actual !== 'string') return false // missing field ⇒ never matches a range
            if (op === '>=') return actual >= value
            if (op === '<=') return actual <= value
            if (op === '>') return actual > value
            if (op === '<') return actual < value
            if (op === '==') return actual === value
            throw new Error(`fakeCollection: unsupported operator ${op}`)
          })
        )
        .map((row) => ({ id: row.id as string, data: () => row })),
    }),
  })
  return build([])
}

const ev = (over: Partial<Event> & Pick<Event, 'id' | 'event_start'>): Partial<Event> => ({
  name: over.id, slug: over.id, status: 'active', created_at: `2026-01-01T00:00:00.000Z`, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  requestScope.reset()
  listEventsCoreSpy.mockResolvedValue([])
  listLeadsCoreSpy.mockResolvedValue([])
  listComplianceDocsCoreSpy.mockResolvedValue([])
  listAllInvoicesCoreSpy.mockResolvedValue([])
  listTasksCoreSpy.mockResolvedValue([])
  listDropsCoreSpy.mockResolvedValue([])
  assertOrgMemberSpy.mockResolvedValue({ role: 'admin' })
  listAllProposalsSpy.mockResolvedValue([])
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. The dedupe
// ─────────────────────────────────────────────────────────────────────────────
describe('loadCalendarSources — one fan-out per request', () => {
  const OPEN_LEAD = { id: 'l1', name: 'Dana', stage: 'inquiry', created_at: 'x' }

  it('serves the feed AND the day detail from a single source load', async () => {
    listLeadsCoreSpy.mockResolvedValue([OPEN_LEAD])

    // Exactly what /calendar/[ymd] renders: the layout's feed, the layout's
    // events for the runway, and the day spine — all in one request.
    await Promise.all([
      orgCalendarFeed('org-1', 'acme'),
      orgEvents('org-1'),
      getDayDetail('org-1', 'acme', '2026-08-22'),
    ])

    expect(listEventsCoreSpy).toHaveBeenCalledTimes(1)
    expect(listLeadsCoreSpy).toHaveBeenCalledTimes(1)
    expect(listAllInvoicesCoreSpy).toHaveBeenCalledTimes(1)
    expect(listComplianceDocsCoreSpy).toHaveBeenCalledTimes(1)
    expect(listDropsCoreSpy).toHaveBeenCalledTimes(1)
    // the 2N per-lead task reads collapse to N
    expect(listTasksCoreSpy).toHaveBeenCalledTimes(1)
    expect(listTasksCoreSpy).toHaveBeenCalledWith('org-1', 'l1')
  })

  /**
   * The rail's Unscheduled section is specified to cost ZERO extra reads. That
   * is a countable claim, so count it: the exact set the calendar layout issues,
   * with `orgUnscheduled` added, must not move a single read counter off 1.
   */
  it('serves the unscheduled list off the SAME load — zero extra reads', async () => {
    listLeadsCoreSpy.mockResolvedValue([OPEN_LEAD])

    const withoutUnscheduled = await Promise.all([
      orgCalendarFeed('org-1', 'acme'),
      orgEvents('org-1'),
    ]).then(() => ({
      events: listEventsCoreSpy.mock.calls.length,
      leads: listLeadsCoreSpy.mock.calls.length,
      invoices: listAllInvoicesCoreSpy.mock.calls.length,
      compliance: listComplianceDocsCoreSpy.mock.calls.length,
      drops: listDropsCoreSpy.mock.calls.length,
      tasks: listTasksCoreSpy.mock.calls.length,
    }))

    await orgUnscheduled('org-1', 'acme')

    expect({
      events: listEventsCoreSpy.mock.calls.length,
      leads: listLeadsCoreSpy.mock.calls.length,
      invoices: listAllInvoicesCoreSpy.mock.calls.length,
      compliance: listComplianceDocsCoreSpy.mock.calls.length,
      drops: listDropsCoreSpy.mock.calls.length,
      tasks: listTasksCoreSpy.mock.calls.length,
    }).toEqual(withoutUnscheduled)
    // …and the baseline it did not move really was one read each, not zero.
    expect(withoutUnscheduled).toEqual({
      events: 1, leads: 1, invoices: 1, compliance: 1, drops: 1, tasks: 1,
    })
  })

  /** The tier the rail paints ("Sold") is derived from lead STAGES that only
   *  exist on this side of the wire — so it has to be attached here. */
  it('tags a closed_won opportunity behind an undated event as committed', async () => {
    listLeadsCoreSpy.mockResolvedValue([
      { id: 'l1', name: 'Dana', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'l2', name: 'Sam', stage: 'inquiry', created_at: '2026-08-02T00:00:00.000Z' },
    ])
    listEventsCoreSpy.mockResolvedValue([
      { id: 'e1', name: 'Alder wedding', slug: 'alder', status: 'active', lead_id: 'l1', created_at: '2026-08-03T00:00:00.000Z' },
    ])

    const rows = await orgUnscheduled('org-1', 'acme')
    expect(Object.fromEntries(rows.map((r) => [r.id, r.committed]))).toEqual({ e1: true, l2: false })
  })

  it('getCalendarFeed and getDayDetail share the same load', async () => {
    listLeadsCoreSpy.mockResolvedValue([OPEN_LEAD])
    await Promise.all([
      getCalendarFeed('org-1', 'acme'),
      getDayDetail('org-1', 'acme', '2026-08-22'),
    ])
    expect(listEventsCoreSpy).toHaveBeenCalledTimes(1)
    expect(listTasksCoreSpy).toHaveBeenCalledTimes(1)
  })

  // Mutation check on the verifier itself: if the memoisation vanished, would
  // the assertions above actually fail? End the request scope between the two
  // calls and the very same sequence must read twice. A dedupe test that cannot
  // observe the un-deduped case is asserting nothing.
  it('reads again in a NEW request — proving the counts above detect a lost dedupe', async () => {
    listLeadsCoreSpy.mockResolvedValue([OPEN_LEAD])
    await getCalendarFeed('org-1', 'acme')
    requestScope.reset()
    await getDayDetail('org-1', 'acme', '2026-08-22')
    expect(listEventsCoreSpy).toHaveBeenCalledTimes(2)
    expect(listTasksCoreSpy).toHaveBeenCalledTimes(2)
  })

  it('does not share a load across different orgs', async () => {
    await Promise.all([assembleCalendarFeed('org-1', 'acme'), assembleCalendarFeed('org-2', 'other')])
    expect(listEventsCoreSpy).toHaveBeenCalledTimes(2)
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. The memoised layer must not become an auth bypass
// ─────────────────────────────────────────────────────────────────────────────
describe('auth assertions survive the refactor', () => {
  it('asserts org membership on every cockpit entry point', async () => {
    await getCalendarFeed('org-1', 'acme')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')

    vi.clearAllMocks()
    requestScope.reset()
    await getDayDetail('org-1', 'acme', '2026-08-22')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')

    vi.clearAllMocks()
    requestScope.reset()
    await orgCalendarFeed('org-1', 'acme')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')

    vi.clearAllMocks()
    requestScope.reset()
    await orgEvents('org-1')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')

    vi.clearAllMocks()
    requestScope.reset()
    await orgUnscheduled('org-1', 'acme')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
  })

  it.each([
    ['getCalendarFeed', () => getCalendarFeed('org-1', 'acme')],
    ['getDayDetail', () => getDayDetail('org-1', 'acme', '2026-08-22')],
    ['orgCalendarFeed', () => orgCalendarFeed('org-1', 'acme')],
    ['orgEvents', () => orgEvents('org-1')],
    ['orgUnscheduled', () => orgUnscheduled('org-1', 'acme')],
  ])('%s rejects — and reads nothing — when membership fails', async (_name, call) => {
    assertOrgMemberSpy.mockRejectedValue(new Error('Forbidden'))
    await expect(call()).rejects.toThrow('Forbidden')
    expect(listEventsCoreSpy).not.toHaveBeenCalled()
    expect(listLeadsCoreSpy).not.toHaveBeenCalled()
  })

  it('a warmed cache does not let an unauthorised caller through', async () => {
    // A legitimate member warms the request's shared sources…
    await getCalendarFeed('org-1', 'acme')
    expect(listEventsCoreSpy).toHaveBeenCalledTimes(1)
    // …then membership is revoked. The assertion sits OUTSIDE the memoised load,
    // so the second caller is refused rather than served from the warm cache.
    assertOrgMemberSpy.mockRejectedValue(new Error('Forbidden'))
    await expect(getDayDetail('org-1', 'acme', '2026-08-22')).rejects.toThrow('Forbidden')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bounded queries — the spanning event is the regression to fear
// ─────────────────────────────────────────────────────────────────────────────
describe('loadCalendarEvents — span-aware bounding', () => {
  const WEEK = { from: '2026-08-17', to: '2026-08-23' }

  const ROWS = [
    ev({ id: 'spans-in', event_start: '2026-08-10', event_end: '2026-08-19' }),   // starts BEFORE, ends inside
    ev({ id: 'spans-through', event_start: '2026-08-01', event_end: '2026-09-30' }), // brackets the window
    ev({ id: 'inside', event_start: '2026-08-18', event_end: '2026-08-18' }),
    ev({ id: 'starts-inside-ends-after', event_start: '2026-08-23', event_end: '2026-08-25' }),
    ev({ id: 'no-end-inside', event_start: '2026-08-20' }),                        // legacy row, no event_end
    ev({ id: 'before', event_start: '2026-08-01', event_end: '2026-08-02' }),
    ev({ id: 'no-end-before', event_start: '2026-08-01' }),                        // single-day by fallback
    ev({ id: 'after', event_start: '2026-09-01', event_end: '2026-09-01' }),
  ] as Array<Record<string, unknown>>

  it('keeps a multi-day event that STARTS BEFORE the window and ends inside it', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection(ROWS))
    const ids = (await loadCalendarEvents('org-1', WEEK.from, WEEK.to)).map((e) => e.id)
    expect(ids).toContain('spans-in')
    expect(ids).toContain('spans-through')
  })

  it('keeps every overlapping event and drops only the non-overlapping ones', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection(ROWS))
    const ids = (await loadCalendarEvents('org-1', WEEK.from, WEEK.to)).map((e) => e.id).sort()
    expect(ids).toEqual(
      ['spans-in', 'spans-through', 'inside', 'starts-inside-ends-after', 'no-end-inside'].sort()
    )
  })

  it('catches a legacy row with no event_end on the start-side query', async () => {
    // A range filter excludes documents missing the field, so such a row can only
    // be found on event_start — and, read as single-day, that is also correct.
    eventsRefSpy.mockReturnValue(fakeCollection(ROWS))
    const ids = (await loadCalendarEvents('org-1', WEEK.from, WEEK.to)).map((e) => e.id)
    expect(ids).toContain('no-end-inside')
    expect(ids).not.toContain('no-end-before')
  })

  it('returns each event once even though two queries are unioned', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection(ROWS))
    const ids = (await loadCalendarEvents('org-1', WEEK.from, WEEK.to)).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('preserves listEventsCore’s newest-created-first ordering', async () => {
    eventsRefSpy.mockReturnValue(
      fakeCollection([
        ev({ id: 'older', event_start: '2026-08-18', event_end: '2026-08-18', created_at: '2026-01-01T00:00:00.000Z' }),
        ev({ id: 'newer', event_start: '2026-08-19', event_end: '2026-08-19', created_at: '2026-06-01T00:00:00.000Z' }),
      ] as Array<Record<string, unknown>>)
    )
    const ids = (await loadCalendarEvents('org-1', WEEK.from, WEEK.to)).map((e) => e.id)
    expect(ids).toEqual(['newer', 'older'])
  })

  it('falls back to the whole collection when no window is given (agenda / ICS / runway)', async () => {
    await loadCalendarEvents('org-1', null, null)
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(eventsRefSpy).not.toHaveBeenCalled()
  })
})

describe('loadCalendarSources — what is bounded and what is deliberately not', () => {
  const WEEK = { from: '2026-08-17', to: '2026-08-23' }

  it('bounds invoices by due_date and compliance by expires_on', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection([]))
    invoicesRefSpy.mockReturnValue(
      fakeCollection([
        { id: 'due-in', lead_id: 'l', lifecycle: 'sent', due_date: '2026-08-20', line_items: [], payments: [] },
        { id: 'due-out', lead_id: 'l', lifecycle: 'sent', due_date: '2026-10-01', line_items: [], payments: [] },
        { id: 'no-due', lead_id: 'l', lifecycle: 'sent', line_items: [], payments: [] }, // emits no item anyway
      ])
    )
    complianceDocsRefSpy.mockReturnValue(
      fakeCollection([
        { id: 'exp-in', name: 'Health permit', expires_on: '2026-08-18' },
        { id: 'exp-out', name: 'Liquor licence', expires_on: '2027-01-01' },
        { id: 'no-exp', name: 'Insurance' }, // emits no item anyway
      ])
    )

    const s = await loadCalendarSources('org-1', WEEK.from, WEEK.to)

    expect(s.invoices.map((i) => i.id)).toEqual(['due-in'])
    expect(s.complianceDocs.map((d) => d.id)).toEqual(['exp-in'])
    // the whole-collection reads are not issued at all on the bounded path
    expect(listAllInvoicesCoreSpy).not.toHaveBeenCalled()
    expect(listComplianceDocsCoreSpy).not.toHaveBeenCalled()
  })

  it('still reads leads and drops whole — neither is safely boundable', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection([]))
    invoicesRefSpy.mockReturnValue(fakeCollection([]))
    complianceDocsRefSpy.mockReturnValue(fakeCollection([]))
    // A lead with NO event_date still owns a task due inside the window: bounding
    // leads on event_date would drop the lead and silently lose that task.
    listLeadsCoreSpy.mockResolvedValue([{ id: 'l1', name: 'Dana', stage: 'inquiry', created_at: 'x' }])
    listTasksCoreSpy.mockResolvedValue([
      { id: 't1', lead_id: 'l1', title: 'Confirm menu', done: false, due_date: '2026-08-20', created_at: 'x' },
    ])

    const s = await loadCalendarSources('org-1', WEEK.from, WEEK.to)

    expect(listLeadsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listDropsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(s.tasksByLeadId['l1'].map((t) => t.id)).toEqual(['t1'])
  })

  it('a bounded load and an unbounded load are separate cache entries', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection([]))
    invoicesRefSpy.mockReturnValue(fakeCollection([]))
    complianceDocsRefSpy.mockReturnValue(fakeCollection([]))
    await loadCalendarSources('org-1', WEEK.from, WEEK.to)
    await loadCalendarSources('org-1', null, null)
    // the unbounded one must genuinely go and read the whole collections
    expect(listEventsCoreSpy).toHaveBeenCalledTimes(1)
    expect(listAllInvoicesCoreSpy).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. The windowed feed must not truncate the surfaces that need everything
// ─────────────────────────────────────────────────────────────────────────────
describe('assembleCalendarFeed', () => {
  it('reads every collection whole when no window is passed (agenda + ICS + runway)', async () => {
    await assembleCalendarFeed('org-1', 'acme')
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listAllInvoicesCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listComplianceDocsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(eventsRefSpy).not.toHaveBeenCalled()
  })

  it('threads an explicit window down into the queries', async () => {
    eventsRefSpy.mockReturnValue(fakeCollection([]))
    invoicesRefSpy.mockReturnValue(fakeCollection([]))
    complianceDocsRefSpy.mockReturnValue(fakeCollection([]))
    await assembleCalendarFeed('org-1', 'acme', { from: '2026-08-17', to: '2026-08-23' })
    expect(eventsRefSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsCoreSpy).not.toHaveBeenCalled()
  })
})
