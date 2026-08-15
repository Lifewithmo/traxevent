import type { InvoiceAgingBucket, NormalizedInvoice } from '@/lib/types'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

export interface OverdueInvoice {
  id: string
  leadId: string
  label: string        // invoice number, else title, else 'Untitled invoice'
  balance: number
  daysOverdue: number
}

export interface MoneyOverview {
  outstanding: number
  overdue: number
  overdueCount: number
  paidThisMonth: number
  aging: Record<InvoiceAgingBucket, number>
  overdueInvoices: OverdueInvoice[]   // most overdue first
}

const EMPTY_AGING: Record<InvoiceAgingBucket, number> = {
  current: 0, due_soon: 0, due_today: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0,
}

const OVERDUE_BUCKETS: InvoiceAgingBucket[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus']

// Only these lifecycles represent money the org is actually owed.
function isCollectable(inv: NormalizedInvoice): boolean {
  return inv.lifecycle === 'issued' || inv.lifecycle === 'approved'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const DAY_MS = 86_400_000

function daysPastDue(dueDate: string, now: Date): number {
  const due = new Date(dueDate.slice(0, 10) + 'T00:00:00Z').getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((today - due) / DAY_MS)
}

/** Rolls the org's invoices into the numbers — and the rows — the /money overview answers. */
export function buildMoneyOverview(invoices: NormalizedInvoice[], now: Date): MoneyOverview {
  const month = now.toISOString().slice(0, 7)
  const aging = { ...EMPTY_AGING }
  const overdueInvoices: OverdueInvoice[] = []
  let outstanding = 0
  let overdue = 0
  let paidThisMonth = 0

  for (const inv of invoices) {
    // InvoicePayment's timestamp field is `recorded_at`, not `paid_at`.
    for (const p of inv.payments ?? []) {
      if (typeof p.recorded_at === 'string' && p.recorded_at.slice(0, 7) === month) paidThisMonth += p.amount
    }

    if (!isCollectable(inv)) continue

    const balance = round2(invoiceAmountDue(inv) - amountPaid(inv.payments ?? []))
    if (balance <= 0) continue

    outstanding += balance
    const bucket = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle }, now)
    aging[bucket] += balance
    if (OVERDUE_BUCKETS.includes(bucket)) {
      overdue += balance
      overdueInvoices.push({
        id: inv.id,
        leadId: inv.lead_id,
        label: inv.number ?? inv.title ?? 'Untitled invoice',
        balance,
        daysOverdue: inv.due_date ? daysPastDue(inv.due_date, now) : 0,
      })
    }
  }

  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue)
  for (const k of Object.keys(aging) as InvoiceAgingBucket[]) aging[k] = round2(aging[k])
  return {
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    overdueCount: overdueInvoices.length,
    paidThisMonth: round2(paidThisMonth),
    aging,
    overdueInvoices,
  }
}
