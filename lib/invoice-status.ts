import type {
  InvoiceLifecycle, InvoicePaymentStatus, InvoiceAgingBucket, InvoiceType,
} from '@/lib/types'

export const INVOICE_LIFECYCLES: InvoiceLifecycle[] = ['draft', 'sent', 'void']

export const INVOICE_LIFECYCLE_LABELS: Record<InvoiceLifecycle, string> = {
  draft: 'Draft', sent: 'Sent', void: 'Void',
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  quick: 'Quick', deposit: 'Deposit', progress: 'Progress', final: 'Final',
}

// Whole days from `due` to `now` (positive = overdue). Pinned to the UTC
// calendar on BOTH sides deliberately: `now` is reduced to its UTC date and
// the date-only due date is anchored at UTC midnight, so the count is a pure
// function of the instant — a UTC server rendering SSR HTML and a browser in
// any zone hydrating it agree exactly. Components must use THIS for overdue /
// due-in day math, never ambient-zone `new Date(due + 'T00:00:00')` locals:
// that variant diverges between server and viewer every US evening, and in a
// hydrated client component the resulting SSR/client text mismatch is the
// React #418 crash that bricked /checkin (PR #134).
export function daysOverdue(dueDate: string, now: Date): number {
  const due = new Date(dueDate + 'T00:00:00Z').getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((today - due) / 86_400_000)
}

export function derivePaymentStatus(
  input: { total: number; applied: number; lifecycle: InvoiceLifecycle; dueDate?: string },
  now: Date,
): InvoicePaymentStatus {
  const { total, applied, lifecycle, dueDate } = input
  if (lifecycle === 'void') return 'void'
  if (total > 0 && applied > total) return 'overpaid'
  if (total > 0 && applied >= total) return 'paid'
  if (applied > 0) return 'partial'
  if (dueDate && daysOverdue(dueDate, now) < 0) return 'not_due'
  return 'due'
}

export function deriveAging(
  input: { dueDate?: string; balance: number; lifecycle: InvoiceLifecycle },
  now: Date,
): InvoiceAgingBucket {
  const { dueDate, balance } = input
  if (!dueDate || balance <= 0) return 'current'
  const d = daysOverdue(dueDate, now)
  if (d < -3) return 'current'
  if (d < 0) return 'due_soon'
  if (d === 0) return 'due_today'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'd90_plus'
}

export function resolveTipsEnabled(
  invoiceTipsEnabled: boolean | undefined,
  orgTipsEnabled: boolean | undefined,
): boolean {
  return invoiceTipsEnabled ?? orgTipsEnabled ?? false
}
