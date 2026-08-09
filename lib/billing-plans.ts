import type { BillingPlan } from '@/lib/types'

export interface BillingPlanInfo {
  id: BillingPlan
  name: string
  priceLabel: string
  blurb: string
}

export const BILLING_PLANS: Record<BillingPlan, BillingPlanInfo> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    priceLabel: '$199/year',
    blurb: 'Unlimited events and registrants — for camps, ministries, and nonprofits.',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceLabel: '$79/month',
    blurb: 'For wedding, floral, and corporate event businesses — leads, proposals, invoices.',
  },
}

export const BILLING_PLAN_IDS: BillingPlan[] = ['standard', 'business']
