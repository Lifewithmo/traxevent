import type {
  InvoiceAgingBucket, InvoiceLifecycle, InvoicePaymentStatus, NormalizedInvoice,
} from '@/lib/types'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import { derivePaymentStatus, deriveAging, INVOICE_TYPE_LABELS } from '@/lib/invoice-status'
import { invoicePill, type InvoicePill } from '@/lib/invoice-presentation'
// Both helpers live in money-overview because that is the rollup this ledger
// has to agree with; keeping local copies here meant two definitions of "how
// late is this?" that could drift apart unnoticed.
import { daysPastDue, round2 } from '@/lib/money-overview'

/**
 * A row as the org-wide invoices page loads it. `clientName` comes from
 * `listLeads`, so it is the LEAD/JOB name — not the customer's name. The column
 * is labelled "Job" for exactly that reason.
 */
export interface LedgerInvoice extends NormalizedInvoice {
  clientName: string
}

export type LedgerGroupKey = 'overdue' | 'due_soon' | 'awaiting' | 'drafts' | 'settled'

export interface LedgerRow {
  id: string
  leadId: string
  /** `#INV-1042`, else the title, else `Invoice`. */
  label: string
  clientName: string
  /** Type + source ref — both present on every row today and both discarded by the old table. */
  subtext: string
  dueDate?: string
  createdAt: string
  total: number
  paid: number
  /** Negative when overpaid (see `invoiceBalance`). */
  balance: number
  lifecycle: InvoiceLifecycle
  payment: InvoicePaymentStatus
  aging: InvoiceAgingBucket
  pill: InvoicePill
  /** Whole days past due; 0 when not overdue or undated. */
  daysOverdue: number
  group: LedgerGroupKey
}

export interface LedgerGroup {
  key: LedgerGroupKey
  label: string
  rows: LedgerRow[]
  /** See `groupTotal` — the money the group represents, which differs by group. */
  total: number
}

/** Group order = the operator's next decision first. */
const GROUP_ORDER: { key: LedgerGroupKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'awaiting', label: 'Awaiting payment' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'settled', label: 'Settled' },
]

const OVERDUE_BUCKETS: InvoiceAgingBucket[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus']

function classify(
  lifecycle: InvoiceLifecycle,
  payment: InvoicePaymentStatus,
  aging: InvoiceAgingBucket,
  balance: number,
): LedgerGroupKey {
  // Mirrors `isCollectable` in lib/money-overview.ts: only a `sent` invoice owes
  // money. A draft was never asked for; a void was withdrawn.
  if (lifecycle === 'void') return 'settled'
  if (lifecycle === 'draft') return 'drafts'
  if (payment === 'paid' || payment === 'overpaid' || balance <= 0) return 'settled'
  // Money state beats lifecycle: a half-paid invoice that is 30 days late is
  // Overdue, not "Awaiting payment".
  if (OVERDUE_BUCKETS.includes(aging)) return 'overdue'
  if (aging === 'due_soon' || aging === 'due_today') return 'due_soon'
  return 'awaiting'
}

function buildSubtext(inv: LedgerInvoice): string {
  const parts = [INVOICE_TYPE_LABELS[inv.type], inv.source?.label].filter(Boolean)
  return parts.join(' · ')
}

function toRow(inv: LedgerInvoice, now: Date): LedgerRow {
  const total = invoiceAmountDue(inv)
  const paid = amountPaid(inv.payments ?? [])
  const balance = round2(total - paid)
  const payment = derivePaymentStatus(
    { total, applied: paid, lifecycle: inv.lifecycle, dueDate: inv.due_date },
    now,
  )
  const aging = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle }, now)
  const group = classify(inv.lifecycle, payment, aging, balance)
  const days = inv.due_date ? daysPastDue(inv.due_date, now) : 0
  return {
    id: inv.id,
    leadId: inv.lead_id,
    label: inv.number ? `#${inv.number}` : inv.title || 'Invoice',
    clientName: inv.clientName,
    subtext: buildSubtext(inv),
    dueDate: inv.due_date,
    createdAt: inv.created_at,
    total,
    paid,
    balance,
    lifecycle: inv.lifecycle,
    payment,
    aging,
    pill: invoicePill({ lifecycle: inv.lifecycle, payment, aging }),
    daysOverdue: group === 'overdue' && days > 0 ? days : 0,
    group,
  }
}

function byDueDateAsc(a: LedgerRow, b: LedgerRow): number {
  // Undated invoices have no clock running on them — they sort last.
  if (!a.dueDate && !b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
}

/**
 * The money each group represents, which is deliberately NOT the same figure
 * everywhere: an AR group owes a balance, a draft has only a total (nothing has
 * been asked for yet), and a settled invoice is worth what it actually
 * collected — a void collected nothing, so it contributes zero rather than
 * inflating the row with a total that will never arrive.
 */
function groupTotal(key: LedgerGroupKey, rows: LedgerRow[]): number {
  const pick =
    key === 'drafts' ? (r: LedgerRow) => r.total
    : key === 'settled' ? (r: LedgerRow) => r.paid
    : (r: LedgerRow) => r.balance
  return round2(rows.reduce((sum, r) => sum + pick(r), 0))
}

/**
 * Rolls the org's invoices into the urgency-ordered ledger the /invoices page
 * renders. Pure — no React, no JSX.
 *
 * `listAllInvoices` hands us Firestore `orderBy('created_at','desc')`. The
 * re-sort inside each group is the point of this builder: the oldest unpaid
 * debt has to surface first, and creation order says nothing about that.
 */
export function buildInvoiceLedger(invoices: LedgerInvoice[], now: Date): LedgerGroup[] {
  const byKey = new Map<LedgerGroupKey, LedgerRow[]>()
  for (const inv of invoices) {
    const row = toRow(inv, now)
    const bucket = byKey.get(row.group)
    if (bucket) bucket.push(row)
    else byKey.set(row.group, [row])
  }

  const groups: LedgerGroup[] = []
  for (const { key, label } of GROUP_ORDER) {
    const rows = byKey.get(key)
    if (!rows || rows.length === 0) continue
    if (key === 'overdue') rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance)
    else if (key === 'due_soon' || key === 'awaiting') rows.sort(byDueDateAsc)
    // Drafts and Settled have no clock — newest work first.
    else rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    groups.push({ key, label, rows, total: groupTotal(key, rows) })
  }
  return groups
}
