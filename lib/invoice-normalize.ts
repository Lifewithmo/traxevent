import type { DocumentData } from 'firebase-admin/firestore'
import type { Invoice, InvoiceLifecycle, NormalizedInvoice } from '@/lib/types'

// Maps BOTH pre-lifecycle `status` values AND retired lifecycle values
// (approved/issued/voided/replaced/closed) onto the 3-state lifecycle.
const LEGACY_LIFECYCLE: Record<string, InvoiceLifecycle> = {
  draft: 'draft', sent: 'sent', void: 'void',
  partial: 'sent', paid: 'sent',                    // pre-lifecycle status values
  approved: 'draft', issued: 'sent', closed: 'sent', // retired lifecycle values
  voided: 'void', replaced: 'void',
}

export function normalizeInvoice(data: DocumentData): NormalizedInvoice {
  // Legacy docs (pre-lifecycle) may still carry a `status` field at rest, even
  // though the current `Invoice` type no longer declares it.
  const inv = data as Invoice & { status?: string }
  const raw = (inv.lifecycle as string | undefined) ?? inv.status
  const lifecycle: InvoiceLifecycle = raw ? LEGACY_LIFECYCLE[raw] ?? 'draft' : 'draft'
  return {
    ...inv,
    type: inv.type ?? 'quick',
    lifecycle,
    delivery: inv.delivery ?? 'not_sent',
    accounting: inv.accounting ?? 'not_connected',
    dispute: inv.dispute ?? 'none',
  }
}

export function formatInvoiceNumber(seq: number, prefix?: string): string {
  return `${prefix ?? ''}${seq}`
}
