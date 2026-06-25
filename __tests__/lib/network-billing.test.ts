import { describe, it, expect } from 'vitest'
import { seatCount, summarizeMemberBilling, memberBillingLabel } from '@/lib/network-billing'
import type { Org } from '@/lib/types'

const org = (billing_status: Org['billing_status']): Org =>
  ({ id: 'o', name: 'o', slug: 'o', billing_status, created_at: '' }) as Org

describe('seatCount', () => {
  it('is the number of member orgs', () => {
    expect(seatCount([org('active'), org('trialing')])).toBe(2)
    expect(seatCount([])).toBe(0)
  })
})

describe('summarizeMemberBilling', () => {
  it('counts orgs by billing status', () => {
    const s = summarizeMemberBilling([
      org('active'), org('network_managed'), org('network_managed'), org('trialing'), org('inactive'),
    ])
    expect(s).toEqual({ total: 5, active: 1, trialing: 1, inactive: 1, networkManaged: 2 })
  })

  it('treats an unknown/undefined status as inactive', () => {
    const s = summarizeMemberBilling([org(undefined as unknown as Org['billing_status'])])
    expect(s).toEqual({ total: 1, active: 0, trialing: 0, inactive: 1, networkManaged: 0 })
  })
})

describe('memberBillingLabel', () => {
  it('maps each status to a label', () => {
    expect(memberBillingLabel('active')).toBe('Active')
    expect(memberBillingLabel('trialing')).toBe('Trial')
    expect(memberBillingLabel('network_managed')).toBe('Network-managed')
    expect(memberBillingLabel('inactive')).toBe('Inactive')
  })
})
