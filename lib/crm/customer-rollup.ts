import { OPEN_STAGES } from '@/lib/leads'
import type { Customer, Lead, LeadStage } from '@/lib/types'

export interface CustomerRollup {
  openCount: number
  wonCount: number
  lostCount: number
  totalWonValue: number
  openValue: number
  lastContactAt?: string
}

/** Repeat-business summary across every opportunity belonging to one customer. */
export function rollupCustomer(customer: Pick<Customer, 'last_touch_at'>, leads: Lead[]): CustomerRollup {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const value = (l: Lead) => l.estimated_value ?? 0
  const open = leads.filter((l) => isOpen(l.stage))
  const won = leads.filter((l) => l.stage === 'closed_won')
  const touches = [customer.last_touch_at, ...leads.map((l) => l.last_touch_at ?? l.updated_at ?? l.created_at)]
    .filter((t): t is string => Boolean(t))
    .sort()
  return {
    openCount: open.length,
    wonCount: won.length,
    lostCount: leads.filter((l) => l.stage === 'closed_lost').length,
    totalWonValue: won.reduce((n, l) => n + value(l), 0),
    openValue: open.reduce((n, l) => n + value(l), 0),
    lastContactAt: touches[touches.length - 1],
  }
}
