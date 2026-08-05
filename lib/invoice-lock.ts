import type { InvoiceLifecycle } from '@/lib/types'

export const LOCKED_LIFECYCLES: InvoiceLifecycle[] = ['issued', 'voided', 'replaced', 'closed']
export const FINANCIAL_FIELDS = ['line_items', 'type', 'source', 'due_date', 'number', 'discount', 'tax_rate', 'credits']

export class InvoiceLockedError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceLockedError' }
}

export function assertEditable(lifecycle: InvoiceLifecycle, updateKeys: string[]): void {
  if (!LOCKED_LIFECYCLES.includes(lifecycle)) return
  const blocked = updateKeys.filter((k) => FINANCIAL_FIELDS.includes(k))
  if (blocked.length > 0) {
    throw new InvoiceLockedError(
      `Invoice is ${lifecycle} and locked; cannot edit ${blocked.join(', ')}. Void or replace instead.`,
    )
  }
}
