'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { INVOICE_STATUSES, invoiceTotal, amountPaid, paymentStatus } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { previouslyBilled, remainingToBill, assertWithinScope } from '@/lib/invoice-progress'
import { getProposal } from '@/actions/proposals'
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
  InvoiceType,
  NormalizedInvoice,
} from '@/lib/types'

function invoicesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('invoices')
}

export interface CreateInvoiceInput {
  title?: string
  number?: string
  line_items?: InvoiceLineItem[]
  notes?: string
  due_date?: string
  type?: InvoiceType
}

export async function listInvoices(orgId: string, leadId: string): Promise<NormalizedInvoice[]> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => normalizeInvoice(d.data()))
}

export async function listAllInvoices(orgId: string): Promise<NormalizedInvoice[]> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => normalizeInvoice(d.data()))
}

export async function getInvoice(orgId: string, invoiceId: string): Promise<NormalizedInvoice | null> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).doc(invoiceId).get()
  return snap.exists ? normalizeInvoice(snap.data()!) : null
}

export async function createInvoice(orgId: string, leadId: string, input: CreateInvoiceInput): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const invoice: Invoice = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    schema_version: 2,
    type: input.type ?? 'quick',
    lifecycle: 'draft',
    delivery: 'not_sent',
    accounting: 'not_connected',
    dispute: 'none',
    line_items: input.line_items ?? [],
    payments: [],
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.number?.trim() ? { number: input.number.trim() } : {}),
    ...(input.due_date?.trim() ? { due_date: input.due_date.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await invoicesRef(orgId).doc(id).set(invoice)
  return invoice
}

export async function generateFromProposal(
  orgId: string,
  leadId: string,
  proposalId: string,
  opts: { type: InvoiceType },
): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const proposal = await getProposal(orgId, proposalId)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'accepted') throw new Error('Proposal is not accepted')

  const approved = invoiceTotal(proposal.line_items)
  const existing = await listInvoices(orgId, leadId)
  const billed = previouslyBilled(existing, proposalId)

  const source = { type: 'proposal' as const, id: proposalId, label: 'Accepted proposal' }
  const lineSource = { type: 'proposal' as const, id: proposalId }
  let line_items: InvoiceLineItem[]
  if (opts.type === 'final') {
    line_items = [
      { description: 'Final balance', quantity: 1, unit_price: remainingToBill(approved, billed), source: lineSource },
    ]
  } else {
    line_items = proposal.line_items.map((l) => ({ ...l, source: lineSource }))
  }

  if (opts.type !== 'quick') {
    assertWithinScope(invoiceTotal(line_items), billed, approved)
  }

  const invoice = await createInvoice(orgId, leadId, { type: opts.type, line_items })
  await invoicesRef(orgId).doc(invoice.id).update({ source })
  return { ...invoice, source }
}

export interface InvoiceUpdate {
  title?: string
  number?: string
  notes?: string
  due_date?: string
  line_items?: InvoiceLineItem[]
  status?: InvoiceStatus
}

export async function updateInvoice(orgId: string, invoiceId: string, updates: InvoiceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !INVOICE_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  await invoicesRef(orgId).doc(invoiceId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await invoicesRef(orgId).doc(invoiceId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export interface RecordPaymentInput {
  amount: number
  method?: string
  note?: string
}

export async function recordPayment(orgId: string, invoiceId: string, input: RecordPaymentInput): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const invoice = snap.data() as Invoice
  if (invoice.status === 'void') throw new Error('Cannot record payment on a void invoice')

  const now = new Date().toISOString()
  const payment: InvoicePayment = {
    amount: input.amount,
    recorded_at: now,
    ...(input.method?.trim() ? { method: input.method.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  }
  const payments = [...(invoice.payments ?? []), payment]
  const total = invoiceTotal(invoice.line_items ?? [])
  const paid = amountPaid(payments)
  const status = paymentStatus(total, paid, invoice.status === 'draft' ? 'draft' : 'sent')
  await ref.update({ payments, status, updated_at: now })
}

export async function deleteInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await invoicesRef(orgId).doc(invoiceId).delete()
}
