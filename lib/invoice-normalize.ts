import type { DocumentData } from 'firebase-admin/firestore'
import type { Invoice, InvoiceLifecycle, NormalizedInvoice } from '@/lib/types'

const LEGACY_LIFECYCLE: Record<string, InvoiceLifecycle> = {
  draft: 'draft', sent: 'issued', partial: 'issued', paid: 'issued', void: 'voided',
}

export function normalizeInvoice(data: DocumentData): NormalizedInvoice {
  // Legacy docs (pre-lifecycle) may still carry a `status` field at rest, even
  // though the current `Invoice` type no longer declares it.
  const inv = data as Invoice & { status?: string }
  const lifecycle: InvoiceLifecycle =
    inv.lifecycle ?? (inv.status ? LEGACY_LIFECYCLE[inv.status] ?? 'draft' : 'draft')
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
