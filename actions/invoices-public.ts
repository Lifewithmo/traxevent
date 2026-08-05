'use server'

import { adminDb } from '@/lib/firebase-admin'
import { amountPaid, invoiceBalance } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { resolveTipsEnabled } from '@/lib/invoice-status'
import type { InvoiceLineItem, InvoiceType } from '@/lib/types'

// Public-safe projection of an Invoice. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`. Includes computed `amount_paid` + `balance`.
export interface PublicInvoice {
  title?: string
  number?: string
  type: InvoiceType
  line_items: InvoiceLineItem[]
  amount_paid: number
  balance: number
  tips_enabled: boolean
  notes?: string
  due_date?: string
  created_at: string
}

async function findInvoiceByToken(token: string) {
  const snap = await adminDb.collectionGroup('invoices').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Only issued invoices are ever exposed.
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const doc = await findInvoiceByToken(token)
  if (!doc) return null
  const invoice = normalizeInvoice(doc.data())
  if (invoice.lifecycle !== 'issued') return null
  const publicInvoice: PublicInvoice = {
    type: invoice.type,
    line_items: invoice.line_items,
    amount_paid: amountPaid(invoice.payments ?? []),
    balance: invoiceBalance(invoice),
    tips_enabled: resolveTipsEnabled(invoice.tips_enabled, undefined),
    created_at: invoice.created_at,
  }
  if (invoice.title !== undefined) publicInvoice.title = invoice.title
  if (invoice.number !== undefined) publicInvoice.number = invoice.number
  if (invoice.notes !== undefined) publicInvoice.notes = invoice.notes
  if (invoice.due_date !== undefined) publicInvoice.due_date = invoice.due_date
  return publicInvoice
}
