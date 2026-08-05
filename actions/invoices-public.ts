'use server'

import { adminDb } from '@/lib/firebase-admin'
import { amountPaid, invoiceBalance } from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from '@/lib/types'

// Public-safe projection of an Invoice. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`. Includes computed `amount_paid` + `balance`.
export interface PublicInvoice {
  title?: string
  number?: string
  status: InvoiceStatus
  line_items: InvoiceLineItem[]
  amount_paid: number
  balance: number
  notes?: string
  due_date?: string
  created_at: string
}

async function findInvoiceByToken(token: string) {
  const snap = await adminDb.collectionGroup('invoices').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const doc = await findInvoiceByToken(token)
  if (!doc) return null
  const invoice = doc.data() as Invoice
  const status: InvoiceStatus = invoice.status ?? 'draft'
  if (status === 'draft') return null
  const publicInvoice: PublicInvoice = {
    status,
    line_items: invoice.line_items,
    amount_paid: amountPaid(invoice.payments ?? []),
    balance: invoiceBalance(invoice),
    created_at: invoice.created_at,
  }
  if (invoice.title !== undefined) publicInvoice.title = invoice.title
  if (invoice.number !== undefined) publicInvoice.number = invoice.number
  if (invoice.notes !== undefined) publicInvoice.notes = invoice.notes
  if (invoice.due_date !== undefined) publicInvoice.due_date = invoice.due_date
  return publicInvoice
}
