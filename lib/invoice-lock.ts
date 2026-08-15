import type { InvoiceLifecycle } from '@/lib/types'

export const LOCKED_LIFECYCLES: InvoiceLifecycle[] = ['sent', 'void']
export const FINANCIAL_FIELDS = ['line_items', 'type', 'source', 'due_date', 'number', 'discount', 'tax_rate', 'credits']

export class InvoiceLockedError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceLockedError' }
}

export function assertEditable(lifecycle: InvoiceLifecycle, updateKeys: string[]): void {
  if (!LOCKED_LIFECYCLES.includes(lifecycle)) return
  const blocked = updateKeys.filter((k) => FINANCIAL_FIELDS.includes(k))
  if (blocked.length > 0) {
    throw new InvoiceLockedError(
      `Invoice is ${lifecycle} and locked; cannot edit ${blocked.join(', ')}. Use Send update to change a sent invoice.`,
    )
  }
}

/**
 * The document fields the send motion may rewrite — exactly what the editor's
 * pricing/terms state covers. Everything else is identity, not content: `number` is
 * counter-assigned (rewriting it would break the duplicates-impossible invariant),
 * `type`/`source` decide which proposal-scope guardrail applies, and `credits` is
 * derived at generation time. Send update is the only write path onto a sent invoice,
 * so an un-whitelisted key here is a bypass of the sent-invoice lock, not a convenience.
 */
export const SEND_EDITABLE_FIELDS = ['title', 'due_date', 'notes', 'line_items', 'discount', 'tax_rate']

/**
 * Throws (rather than silently dropping) on a non-whitelisted key, mirroring
 * assertEditable: a caller trying to rewrite the number should fail loudly, not
 * have the write quietly disappear.
 */
export function assertSendEditable(updateKeys: string[]): void {
  const blocked = updateKeys.filter((k) => !SEND_EDITABLE_FIELDS.includes(k))
  if (blocked.length > 0) {
    throw new InvoiceLockedError(
      `Cannot change ${blocked.join(', ')} when sending; only ${SEND_EDITABLE_FIELDS.join(', ')} may change.`,
    )
  }
}
