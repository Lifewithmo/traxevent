import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
  getBookabilityCtx (New Opportunity inc 1, contract C5b): the lazy door to the
  Bookability Verdict's context for surfaces that don't get it threaded in at
  page render — the Clients cockpit loads it the first time the New-opportunity
  form opens.

  SLUG-ONLY BY CONTRACT. The first cut took (orgId, orgSlug) as independent
  caller-controlled arguments: assertOrgMember checked the orgId while
  orgBySlug(orgSlug) loaded ANY org's document — so a member of org A could
  hand it org B's slug and read B's plan/prep_lead_days/profiles (and probe
  which slugs exist). The action now resolves the org FROM the slug and asserts
  membership on the RESOLVED id before any data read.
*/

const orgBySlug = vi.hoisted(() => vi.fn())
const loadCalendarEvents = vi.hoisted(() => vi.fn())
const listLeadsCore = vi.hoisted(() => vi.fn())
const assertOrgMember = vi.hoisted(() => vi.fn())
const hasMultiResourceCapacity = vi.hoisted(() => vi.fn())
const listCapacityUnitsCore = vi.hoisted(() => vi.fn())

vi.mock('@/lib/calendar-fetch', () => ({ orgBySlug, loadCalendarEvents }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember }))
vi.mock('@/lib/capacity/units', () => ({ hasMultiResourceCapacity, listCapacityUnitsCore }))

import { getBookabilityCtx } from '@/actions/bookability'

const orgB = { id: 'org-b', org: { slug: 'brewcart', plan: 'starter', prep_lead_days: 9 } }

describe('getBookabilityCtx', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertOrgMember.mockResolvedValue({ role: 'member' })
    orgBySlug.mockResolvedValue(orgB)
    loadCalendarEvents.mockResolvedValue([])
    listLeadsCore.mockResolvedValue([])
    hasMultiResourceCapacity.mockReturnValue(false)
    listCapacityUnitsCore.mockResolvedValue([])
  })

  it("resolves the org from the slug, asserts membership on the RESOLVED id, and builds the ctx with today's local ymd", async () => {
    const ctx = await getBookabilityCtx('brewcart')
    expect(orgBySlug).toHaveBeenCalledWith('brewcart')
    expect(assertOrgMember).toHaveBeenCalledWith('org-b')
    expect(loadCalendarEvents).toHaveBeenCalledWith('org-b', null, null)
    expect(listLeadsCore).toHaveBeenCalledWith('org-b')
    expect(ctx).toMatchObject({
      orgSlug: 'brewcart',
      prepLeadDays: 9, // off the RESOLVED org doc, not a caller-supplied one
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
    expect(ctx?.radar.mode).toBe('degraded')
  })

  it('a member of org A cannot obtain another org’s ctx via its slug — membership is asserted on the resolved id, before any read', async () => {
    // The caller IS authenticated (a member of some org A) but NOT of org-b:
    // the assertion on the resolved id throws.
    assertOrgMember.mockRejectedValue(new Error('Forbidden'))
    await expect(getBookabilityCtx('brewcart')).rejects.toThrow('Forbidden')
    expect(assertOrgMember).toHaveBeenCalledWith('org-b')
    // Nothing of org B's was read: no events, no leads, no units — the doc that
    // orgBySlug loaded is never returned or folded into a ctx.
    expect(loadCalendarEvents).not.toHaveBeenCalled()
    expect(listLeadsCore).not.toHaveBeenCalled()
    expect(listCapacityUnitsCore).not.toHaveBeenCalled()
  })

  it('returns null for a slug that matches no org (caller degrades silently)', async () => {
    orgBySlug.mockResolvedValue(null)
    expect(await getBookabilityCtx('nope')).toBeNull()
    expect(loadCalendarEvents).not.toHaveBeenCalled()
    expect(listLeadsCore).not.toHaveBeenCalled()
  })

  it('skips the units read for a non-business org (the same gate the pipeline page uses)', async () => {
    await getBookabilityCtx('brewcart')
    expect(hasMultiResourceCapacity).toHaveBeenCalledWith(orgB.org)
    expect(listCapacityUnitsCore).not.toHaveBeenCalled()
  })

  it('loads units for a business-tier org and hands them to the capacity radar', async () => {
    hasMultiResourceCapacity.mockReturnValue(true)
    listCapacityUnitsCore.mockResolvedValue([])
    await getBookabilityCtx('brewcart')
    expect(listCapacityUnitsCore).toHaveBeenCalledWith('org-b')
  })
})
