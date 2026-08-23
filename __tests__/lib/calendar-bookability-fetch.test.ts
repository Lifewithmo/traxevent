import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE READ BUDGET for the Bookability Verdict.
 *
 * The claim being defended: ONE added Firestore read for a business-plan org
 * (the capacity_units query) and ZERO for everyone else. That is a countable
 * claim, so this file counts it rather than asserting it in a comment.
 *
 * Two of the three sources it needs were already paid for and are meant to cost
 * nothing extra:
 *   • the Org doc — the slug lookup has always READ the whole document and then
 *     thrown the body away to return an id. `orgBySlug` keeps it.
 *   • leads — the memoised `loadCalendarSources` fan-out that the feed, events,
 *     invoices and the unscheduled list all already share.
 *
 * As in __tests__/lib/calendar-fetch.test.ts, React's `cache()` is a bare
 * pass-through outside an RSC dispatcher, so a dedupe test using the real one
 * would assert nothing. A per-scope memoiser stands in, and `requestScope.reset()`
 * ends the simulated request.
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

const orgQuery = vi.hoisted(() => ({
  calls: 0,
  doc: { id: 'org-1', plan: 'business' as string | undefined, prep_lead_days: undefined as number | undefined },
}))

// The org lookup, counted. One `where('slug','==',…).limit(1).get()` is one read
// of a document that already contains `plan` and `prep_lead_days`.
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name !== 'orgs') throw new Error(`unexpected collection ${name}`)
      return {
        where: () => ({
          limit: () => ({
            get: async () => {
              orgQuery.calls += 1
              return {
                empty: false,
                docs: [{ id: orgQuery.doc.id, data: () => orgQuery.doc }],
              }
            },
          }),
        }),
      }
    },
  },
  adminAuth: {},
  adminBucket: {},
}))

const listEventsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listLeadsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listComplianceDocsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listAllInvoicesCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listTasksCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listDropsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const listCapacityUnitsCoreSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))

vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy, eventsRef: vi.fn() }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore: listLeadsCoreSpy }))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore: listTasksCoreSpy }))
vi.mock('@/lib/crm/invoices', () => ({ listAllInvoicesCore: listAllInvoicesCoreSpy, invoicesRef: vi.fn() }))
vi.mock('@/lib/ops/compliance', () => ({
  listComplianceDocsCore: listComplianceDocsCoreSpy,
  complianceDocsRef: vi.fn(),
}))
vi.mock('@/lib/storefront/drops', () => ({ listDropsCore: listDropsCoreSpy }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy }))
// The plan gate stays REAL — it is the thing under test. Only the query is faked.
vi.mock('@/lib/capacity/units', async () => ({
  listCapacityUnitsCore: listCapacityUnitsCoreSpy,
  hasMultiResourceCapacity: (await import('@/lib/capacity/capacity')).hasMultiResourceCapacity,
}))

import {
  orgBookabilityCtx,
  orgBySlug,
  orgCalendarFeed,
  orgCapacityUnits,
  orgIdBySlug,
} from '@/lib/calendar-fetch'

const TODAY = '2026-08-23'

beforeEach(() => {
  vi.clearAllMocks()
  requestScope.reset()
  orgQuery.calls = 0
  orgQuery.doc = { id: 'org-1', plan: 'business', prep_lead_days: undefined }
  listEventsCoreSpy.mockResolvedValue([])
  listLeadsCoreSpy.mockResolvedValue([])
  listComplianceDocsCoreSpy.mockResolvedValue([])
  listAllInvoicesCoreSpy.mockResolvedValue([])
  listTasksCoreSpy.mockResolvedValue([])
  listDropsCoreSpy.mockResolvedValue([])
  listCapacityUnitsCoreSpy.mockResolvedValue([])
  assertOrgMemberSpy.mockResolvedValue({ role: 'admin' })
})

describe('orgBySlug / orgIdBySlug', () => {
  it('keeps the document the slug lookup was already paying for', async () => {
    const found = await orgBySlug('acme')
    expect(found).toEqual({ id: 'org-1', org: orgQuery.doc })
  })

  it('the id-only entry point still costs exactly one lookup, shared with orgBySlug', async () => {
    await Promise.all([orgIdBySlug('acme'), orgBySlug('acme'), orgIdBySlug('acme')])
    expect(orgQuery.calls).toBe(1)
  })
})

describe('orgCapacityUnits — the plan gate is a read gate', () => {
  it('reads the collection for a business-plan org', async () => {
    await orgCapacityUnits('org-1', 'business')
    expect(listCapacityUnitsCoreSpy).toHaveBeenCalledTimes(1)
  })

  it('reads NOTHING for a base/solo org', async () => {
    await orgCapacityUnits('org-1', 'standard')
    await orgCapacityUnits('org-1', undefined)
    expect(listCapacityUnitsCoreSpy).not.toHaveBeenCalled()
  })
})

describe('orgBookabilityCtx — the read budget', () => {
  it('adds exactly ONE read on top of the calendar feed, and it is capacity_units', async () => {
    // The layout's existing work, in the order the route performs it: resolve
    // the slug, then load the feed.
    await orgIdBySlug('acme')
    await orgCalendarFeed('org-1', 'acme')
    const before = {
      orgLookups: orgQuery.calls,
      events: listEventsCoreSpy.mock.calls.length,
      leads: listLeadsCoreSpy.mock.calls.length,
      invoices: listAllInvoicesCoreSpy.mock.calls.length,
      compliance: listComplianceDocsCoreSpy.mock.calls.length,
      drops: listDropsCoreSpy.mock.calls.length,
      units: listCapacityUnitsCoreSpy.mock.calls.length,
    }
    expect(before.units).toBe(0)
    // The org doc has already been read once, for the id. That read is the one
    // the verdict reuses instead of issuing its own.
    expect(before.orgLookups).toBe(1)

    await orgBookabilityCtx('org-1', 'acme', TODAY)

    expect({
      orgLookups: orgQuery.calls,
      events: listEventsCoreSpy.mock.calls.length,
      leads: listLeadsCoreSpy.mock.calls.length,
      invoices: listAllInvoicesCoreSpy.mock.calls.length,
      compliance: listComplianceDocsCoreSpy.mock.calls.length,
      drops: listDropsCoreSpy.mock.calls.length,
      units: 1,
    }).toEqual({ ...before, units: 1 })
  })

  it('adds ZERO reads for a base/solo org', async () => {
    orgQuery.doc = { id: 'org-1', plan: 'standard', prep_lead_days: undefined }
    await orgCalendarFeed('org-1', 'acme')
    const leadsBefore = listLeadsCoreSpy.mock.calls.length

    const ctx = await orgBookabilityCtx('org-1', 'acme', TODAY)

    expect(listCapacityUnitsCoreSpy).not.toHaveBeenCalled()
    expect(listLeadsCoreSpy.mock.calls.length).toBe(leadsBefore)
    expect(ctx?.radar.mode).toBe('degraded')
  })

  it('is memoised — the layout and the day route share one context', async () => {
    await Promise.all([
      orgBookabilityCtx('org-1', 'acme', TODAY),
      orgBookabilityCtx('org-1', 'acme', TODAY),
    ])
    expect(listCapacityUnitsCoreSpy).toHaveBeenCalledTimes(1)
    expect(orgQuery.calls).toBe(1)
  })

  /** Mutation check on this verifier: end the request and the same sequence has
   *  to read twice, or the counts above are measuring nothing. */
  it('reads again in a NEW request — proving the counts detect a lost dedupe', async () => {
    await orgBookabilityCtx('org-1', 'acme', TODAY)
    requestScope.reset()
    await orgBookabilityCtx('org-1', 'acme', TODAY)
    expect(listCapacityUnitsCoreSpy).toHaveBeenCalledTimes(2)
    expect(orgQuery.calls).toBe(2)
  })

  it('asserts membership BEFORE touching a source — including the org lookup', async () => {
    assertOrgMemberSpy.mockRejectedValueOnce(new Error('not a member'))
    await expect(orgBookabilityCtx('org-1', 'acme', TODAY)).rejects.toThrow('not a member')
    expect(listCapacityUnitsCoreSpy).not.toHaveBeenCalled()
    expect(listLeadsCoreSpy).not.toHaveBeenCalled()
    // The org DOCUMENT counts as a source too. Leaving it out of this assertion
    // let a mutation that moved `assertOrgMember` one line down survive — the
    // test named a contract ("before touching a source") that it only half
    // checked, which is the exact class of defect this repo has been bitten by.
    expect(orgQuery.calls).toBe(0)
  })

  it('carries the org prep lead through to the context', async () => {
    orgQuery.doc = { id: 'org-1', plan: 'business', prep_lead_days: 21 }
    const ctx = await orgBookabilityCtx('org-1', 'acme', TODAY)
    expect(ctx?.prepLeadDays).toBe(21)
    expect(ctx?.today).toBe(TODAY)
    expect(ctx?.orgSlug).toBe('acme')
  })

  it('enters capacity mode once the business org has a unit', async () => {
    listCapacityUnitsCoreSpy.mockResolvedValue([
      { id: 'k1', name: 'Kart 1', kind: 'mobile', active: true, blockouts: [], created_at: 'x' },
    ])
    const ctx = await orgBookabilityCtx('org-1', 'acme', TODAY)
    expect(ctx?.radar.mode).toBe('capacity')
  })

  /** The zero-units backstop, end to end through the data layer this time. */
  it('stays on the backstop for a business org with no units defined yet', async () => {
    listLeadsCoreSpy.mockResolvedValue([
      { id: 'l1', name: 'Dana', stage: 'inquiry', created_at: 'x', event_date: '2026-12-05' },
    ])
    const ctx = await orgBookabilityCtx('org-1', 'acme', TODAY)
    expect(ctx?.radar.mode).toBe('degraded')
  })
})
