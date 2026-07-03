import { describe, it, expect } from 'vitest'
import { BILLING_PLANS, BILLING_PLAN_IDS } from '@/lib/billing-plans'

describe('BILLING_PLANS', () => {
  it('has a standard and a business plan with names and price labels', () => {
    expect(BILLING_PLAN_IDS).toEqual(['standard', 'business'])
    expect(BILLING_PLANS.standard).toMatchObject({ id: 'standard', name: 'Standard', priceLabel: '$199/year' })
    expect(BILLING_PLANS.business).toMatchObject({ id: 'business', name: 'Business', priceLabel: '$79/month' })
    for (const id of BILLING_PLAN_IDS) {
      expect(BILLING_PLANS[id].blurb).toBeTruthy()
    }
  })
})
