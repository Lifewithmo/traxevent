import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BillingPlan } from '@/lib/types'

const createCheckoutSpy = vi.hoisted(() => vi.fn())
const getOrgSpy = vi.hoisted(() => vi.fn())
const assertOrgAdminSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: createCheckoutSpy } },
  },
}))

vi.mock('@/actions/orgs', () => ({
  getOrg: getOrgSpy,
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
}))

import { createCheckoutSession } from '@/actions/billing'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_PRICE_ID = 'price_std'
  process.env.STRIPE_BUSINESS_PRICE_ID = 'price_biz'
  process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost'
  assertOrgAdminSpy.mockResolvedValue(undefined)
  getOrgSpy.mockResolvedValue({ id: 'org-1', slug: 'o' })
  createCheckoutSpy.mockResolvedValue({ url: 'https://cs' })
})

describe('createCheckoutSession', () => {
  it('defaults to the standard plan', async () => {
    const url = await createCheckoutSession('org-1', 'o')

    expect(assertOrgAdminSpy).toHaveBeenCalledWith('org-1')
    expect(createCheckoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_std', quantity: 1 }],
        metadata: { orgId: 'org-1', plan: 'standard' },
        subscription_data: { metadata: { orgId: 'org-1', plan: 'standard' } },
      })
    )
    expect(url).toBe('https://cs')
  })

  it('uses the business price for the business plan', async () => {
    await createCheckoutSession('org-1', 'o', 'business')

    expect(createCheckoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_biz', quantity: 1 }],
        metadata: { orgId: 'org-1', plan: 'business' },
        subscription_data: { metadata: { orgId: 'org-1', plan: 'business' } },
      })
    )
  })

  it('throws Invalid plan and does not call Stripe for an unknown plan', async () => {
    await expect(
      createCheckoutSession('org-1', 'o', 'gold' as BillingPlan)
    ).rejects.toThrow('Invalid plan')
    expect(createCheckoutSpy).not.toHaveBeenCalled()
  })

  it("throws when the selected plan's price env is unset", async () => {
    delete process.env.STRIPE_BUSINESS_PRICE_ID

    await expect(
      createCheckoutSession('org-1', 'o', 'business')
    ).rejects.toThrow('Plan price is not configured')
  })
})
