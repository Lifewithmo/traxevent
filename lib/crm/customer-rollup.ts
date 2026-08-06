import { OPEN_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

export interface CustomerRollup {
  openCount: number
  wonCount: number
  lostCount: number
  totalWonValue: number
  openValue: number
  lastActivityAt?: string
}

/** Repeat-business summary across every opportunity belonging to one customer. */
export function rollupCustomer(leads: Lead[]): CustomerRollup {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const value = (l: Lead) => l.estimated_value ?? 0
  const open = leads.filter((l) => isOpen(l.stage))
  const won = leads.filter((l) => l.stage === 'closed_won')
  const stamps = leads.map((l) => l.updated_at ?? l.created_at).filter(Boolean).sort()
  return {
    openCount: open.length,
    wonCount: won.length,
    lostCount: leads.filter((l) => l.stage === 'closed_lost').length,
    totalWonValue: won.reduce((n, l) => n + value(l), 0),
    openValue: open.reduce((n, l) => n + value(l), 0),
    lastActivityAt: stamps[stamps.length - 1],
  }
}
