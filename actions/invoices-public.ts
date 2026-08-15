'use server'

import { adminDb } from '@/lib/firebase-admin'
import {
  amountPaid,
  invoiceBalance,
  invoiceAmountDue,
  linesSubtotal,
  invoiceDiscountAmount,
  invoiceTaxAmount,
} from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { resolveTipsEnabled } from '@/lib/invoice-status'
import type { Customer, InvoiceCredit, InvoiceLineItem, InvoiceType, Lead, Org } from '@/lib/types'

// Public-safe projection of an Invoice. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`. Includes computed `amount_paid` + `balance`
// and the full money breakdown (subtotal/discount/tax/credits/total).
export interface PublicInvoice {
  title?: string
  number?: string
  /** Issuing business: branding display name (fallback org name) + branding address. */
  from?: { name: string; address?: string }
  /** Invoiced customer: name plus public-safe contact identity. */
  bill_to?: { name: string; company?: string; email?: string }
  type: InvoiceType
  line_items: InvoiceLineItem[]
  subtotal: number
  discount_amount: number
  tax_amount: number
  credits: InvoiceCredit[]
  total: number
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

async function readDoc<T>(path: string): Promise<T | null> {
  try {
    const snap = await adminDb.doc(path).get()
    return snap.exists ? (snap.data() as T) : null
  } catch {
    return null
  }
}

/**
 * From / Bill-to parties for the invoice document (design system: the public
 * invoice reads as a document between two named parties). Best-effort — a
 * failed lookup omits the block rather than failing the invoice. Only
 * public-safe identity fields are projected.
 */
async function resolveParties(invoice: {
  org_id?: string
  lead_id?: string
  customer_id?: string
}): Promise<Pick<PublicInvoice, 'from' | 'bill_to'>> {
  const out: Pick<PublicInvoice, 'from' | 'bill_to'> = {}
  if (!invoice.org_id) return out

  const [org, customer, lead] = await Promise.all([
    readDoc<Org>(`orgs/${invoice.org_id}`),
    invoice.customer_id ? readDoc<Customer>(`orgs/${invoice.org_id}/customers/${invoice.customer_id}`) : null,
    invoice.lead_id ? readDoc<Lead>(`orgs/${invoice.org_id}/leads/${invoice.lead_id}`) : null,
  ])

  const fromName = org?.branding?.display_name || org?.name
  if (fromName) {
    out.from = {
      name: fromName,
      ...(org?.branding?.address ? { address: org.branding.address } : {}),
    }
  }

  if (customer?.name) {
    out.bill_to = {
      name: customer.name,
      ...(customer.company ? { company: customer.company } : {}),
      ...(customer.email ? { email: customer.email } : {}),
    }
  } else if (lead?.name) {
    out.bill_to = {
      name: lead.name,
      ...(lead.organization ? { company: lead.organization } : {}),
      ...(lead.email ? { email: lead.email } : {}),
    }
  }
  return out
}

// PUBLIC (token = authorization). Only sent invoices are ever exposed.
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const doc = await findInvoiceByToken(token)
  if (!doc) return null
  const raw = doc.data() as { org_id?: string; lead_id?: string; customer_id?: string }
  const invoice = normalizeInvoice(doc.data())
  if (invoice.lifecycle !== 'sent') return null
  const parties = await resolveParties(raw)
  const subtotal = linesSubtotal(invoice.line_items)
  const discount_amount = invoiceDiscountAmount(subtotal, invoice.discount)
  const tax_amount = invoiceTaxAmount(subtotal - discount_amount, invoice.tax_rate)
  const publicInvoice: PublicInvoice = {
    type: invoice.type,
    line_items: invoice.line_items,
    subtotal,
    discount_amount,
    tax_amount,
    credits: invoice.credits ?? [],
    total: invoiceAmountDue(invoice),
    amount_paid: amountPaid(invoice.payments ?? []),
    balance: invoiceBalance(invoice),
    tips_enabled: resolveTipsEnabled(invoice.tips_enabled, undefined),
    created_at: invoice.created_at,
  }
  if (parties.from) publicInvoice.from = parties.from
  if (parties.bill_to) publicInvoice.bill_to = parties.bill_to
  if (invoice.title !== undefined) publicInvoice.title = invoice.title
  if (invoice.number !== undefined) publicInvoice.number = invoice.number
  if (invoice.notes !== undefined) publicInvoice.notes = invoice.notes
  if (invoice.due_date !== undefined) publicInvoice.due_date = invoice.due_date
  return publicInvoice
}
