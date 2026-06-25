import type { Org } from '@/lib/types'

export interface MemberBillingSummary {
  total: number
  active: number
  trialing: number
  inactive: number
  networkManaged: number
}

// Seats billed for a network subscription = number of member orgs.
export function seatCount(orgs: Org[]): number {
  return orgs.length
}

export function summarizeMemberBilling(orgs: Org[]): MemberBillingSummary {
  const s: MemberBillingSummary = { total: orgs.length, active: 0, trialing: 0, inactive: 0, networkManaged: 0 }
  for (const o of orgs) {
    if (o.billing_status === 'active') s.active++
    else if (o.billing_status === 'trialing') s.trialing++
    else if (o.billing_status === 'network_managed') s.networkManaged++
    else s.inactive++
  }
  return s
}

export function memberBillingLabel(status: Org['billing_status']): string {
  switch (status) {
    case 'active': return 'Active'
    case 'trialing': return 'Trial'
    case 'network_managed': return 'Network-managed'
    default: return 'Inactive'
  }
}
