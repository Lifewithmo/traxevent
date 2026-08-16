import type { Invoice } from '@/lib/types'
import { amountPaid, invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

export function filterInvoicesByLeadIds(invoices: Invoice[], leadIds: Iterable<string>): Invoice[] {
  const set = leadIds instanceof Set ? leadIds : new Set(leadIds)
  return invoices.filter((i) => i.lead_id != null && set.has(i.lead_id))
}

export interface CustomerAR {
  invoiced: number
  paid: number
  outstanding: number
  overdueAmount: number
  nextDueDate?: string
  openCount: number
}

const OVERDUE_BUCKETS = new Set(['d1_30', 'd31_60', 'd61_90', 'd90_plus'])

export function customerAR(invoices: Invoice[], now: Date): CustomerAR {
  const sent = invoices.filter((i) => i.lifecycle === 'sent')
  let invoiced = 0, paid = 0, outstanding = 0, overdueAmount = 0, openCount = 0
  let nextDueDate: string | undefined
  for (const inv of sent) {
    invoiced += invoiceAmountDue(inv)
    paid += amountPaid(inv.payments)
    const balance = invoiceBalance(inv)
    if (balance > 0) {
      outstanding += balance
      openCount += 1
      if (inv.due_date && (!nextDueDate || inv.due_date < nextDueDate)) nextDueDate = inv.due_date
      const aging = deriveAging({ dueDate: inv.due_date, balance, lifecycle: 'sent' }, now)
      if (OVERDUE_BUCKETS.has(aging)) overdueAmount += balance
    }
  }
  return {
    invoiced: round2(invoiced), paid: round2(paid), outstanding: round2(outstanding),
    overdueAmount: round2(overdueAmount), nextDueDate, openCount,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
