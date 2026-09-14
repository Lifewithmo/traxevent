import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
  getBookabilityCtx (New Opportunity inc 1): the lazy door to the Bookability
  Verdict's context for surfaces that don't get it threaded in at page render —
  the Clients cockpit loads it the first time the New-opportunity form opens.
  A thin wrapper: authorization (assertOrgMember) and all reads live inside
  orgBookabilityCtx (lib/calendar-fetch); this action only supplies `today`.
*/

const orgBookabilityCtxSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/calendar-fetch', () => ({ orgBookabilityCtx: orgBookabilityCtxSpy }))

import { getBookabilityCtx } from '@/actions/bookability'

describe('getBookabilityCtx', () => {
  beforeEach(() => vi.clearAllMocks())

  it("delegates to orgBookabilityCtx with today's local ymd", async () => {
    const ctx = { mode: 'degraded', conflictDates: [], bookedCounts: {} }
    orgBookabilityCtxSpy.mockResolvedValue(ctx)
    const result = await getBookabilityCtx('org-1', 'brewcart')
    expect(orgBookabilityCtxSpy).toHaveBeenCalledWith(
      'org-1',
      'brewcart',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    )
    expect(result).toBe(ctx)
  })

  it('passes a null ctx through untouched (base tier degrades silently)', async () => {
    orgBookabilityCtxSpy.mockResolvedValue(null)
    expect(await getBookabilityCtx('org-1', 'brewcart')).toBeNull()
  })
})
