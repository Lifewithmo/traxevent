'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { invoiceTotal, amountPaid } from '@/lib/invoices'
import { normalizeInvoice, formatInvoiceNumber } from '@/lib/invoice-normalize'
import { previouslyBilled, remainingToBill, assertWithinScope, acceptedProposalTotal } from '@/lib/invoice-progress'
import { depositAmount } from '@/lib/proposals'
import { assertEditable } from '@/lib/invoice-lock'
import { derivePaymentStatus } from '@/lib/invoice-status'
import { getProposal } from '@/actions/proposals'
import { getLead } from '@/actions/leads'
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
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
  const lead = await getLead(orgId, leadId)
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
    ...(lead?.customer_id ? { customer_id: lead.customer_id } : {}),
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

  const accepted = acceptedProposalTotal(proposal)
  const existing = await listInvoices(orgId, leadId)
  const billed = previouslyBilled(existing, proposalId)

  const source = { type: 'proposal' as const, id: proposalId, label: 'Accepted proposal' }
  const lineSource = { type: 'proposal' as const, id: proposalId }
  let line: InvoiceLineItem
  switch (opts.type) {
    case 'deposit':
      line = { description: 'Deposit', quantity: 1, unit_price: depositAmount(accepted, proposal.deposit), source: lineSource }
      break
    case 'final':
      line = { description: 'Final balance', quantity: 1, unit_price: remainingToBill(accepted, billed), source: lineSource }
      break
    case 'progress':
      line = { description: 'Progress payment', quantity: 1, unit_price: 0, source: lineSource }
      break
    default: // quick
      line = { description: 'Per accepted proposal', quantity: 1, unit_price: accepted, source: lineSource }
  }
  const line_items = [line]

  if (opts.type !== 'quick') {
    assertWithinScope(invoiceTotal(line_items), billed, accepted)
  }

  const invoice = await createInvoice(orgId, leadId, { type: opts.type, line_items })
  await invoicesRef(orgId).doc(invoice.id).update({ source })
  return { ...invoice, source }
}

export interface InvoiceUpdate {
  type?: InvoiceType
  title?: string
  number?: string
  notes?: string
  due_date?: string
  line_items?: InvoiceLineItem[]
}

export async function updateInvoice(orgId: string, invoiceId: string, updates: InvoiceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  assertEditable(inv.lifecycle, Object.keys(updates))
  await ref.update({ ...updates, updated_at: new Date().toISOString() })
}

export async function approveInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'draft') throw new Error('Only a draft can be approved')
  await ref.update({ lifecycle: 'approved', updated_at: new Date().toISOString() })
}

export async function issueInvoice(orgId: string, invoiceId: string): Promise<{ number: string }> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const counterRef = adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')

  // Enforce the scope invariant at issue time, mirroring generateFromProposal's
  // in-memory check. This must happen with plain (non-transaction) reads —
  // Firestore transactions cannot run queries — so it's done before we ever
  // open the transaction below.
  const preSnap = await ref.get()
  if (!preSnap.exists) throw new Error('Invoice not found')
  const preInv = normalizeInvoice(preSnap.data()!)
  if (preInv.source?.type === 'proposal' && preInv.source.id && preInv.type !== 'quick') {
    const proposal = await getProposal(orgId, preInv.source.id)
    if (proposal) {
      const approved = acceptedProposalTotal(proposal)
      const existing = await listInvoices(orgId, preInv.lead_id)
      const billed = previouslyBilled(existing, preInv.source.id)
      assertWithinScope(invoiceTotal(preInv.line_items), billed, approved)
    }
  }

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Invoice not found')
    const inv = normalizeInvoice(snap.data()!)
    if (inv.lifecycle !== 'draft' && inv.lifecycle !== 'approved') {
      throw new Error(`Cannot issue an invoice that is ${inv.lifecycle}`)
    }
    const counterSnap = await tx.get(counterRef)
    const counterData = counterSnap.exists ? (counterSnap.data() as { seq: number; prefix?: string }) : undefined
    const seq = (counterData?.seq ?? 1000) + 1
    const prefix = counterData?.prefix
    const number = formatInvoiceNumber(seq, prefix)
    const now = new Date().toISOString()

    tx.set(counterRef, { seq }, { merge: true })
    tx.set(ref, { lifecycle: 'issued', number, issued_at: now, updated_at: now }, { merge: true })
    return { number }
  })
}

export async function voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const now = new Date().toISOString()
  await ref.update({
    lifecycle: 'voided',
    updated_at: now,
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
}

export async function replaceInvoice(orgId: string, invoiceId: string): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const original = normalizeInvoice(snap.data()!)
  const draft = await createInvoice(orgId, original.lead_id, {
    type: original.type,
    line_items: original.line_items,
    title: original.title,
    due_date: original.due_date,
    notes: original.notes,
  })
  const now = new Date().toISOString()
  await invoicesRef(orgId)
    .doc(draft.id)
    .update({ replaces_id: invoiceId, ...(original.source ? { source: original.source } : {}) })
  await ref.update({ lifecycle: 'replaced', replaced_by_id: draft.id, updated_at: now })
  return { ...draft, replaces_id: invoiceId }
}

export interface RecordPaymentInput {
  amount: number
  method?: string
  note?: string
  tip_amount?: number
}

export async function recordPayment(orgId: string, invoiceId: string, input: RecordPaymentInput): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle === 'voided' || inv.lifecycle === 'replaced') {
    throw new Error('Cannot record payment on a voided invoice')
  }

  const now = new Date().toISOString()
  const payment: InvoicePayment = {
    amount: input.amount,
    recorded_at: now,
    ...(input.method?.trim() ? { method: input.method.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...((input.tip_amount ?? 0) > 0 ? { tip_amount: input.tip_amount } : {}),
  }
  const payments = [...(inv.payments ?? []), payment]
  const total = invoiceTotal(inv.line_items ?? [])
  const applied = amountPaid(payments)
  const payment_status = derivePaymentStatus(
    { total, applied, lifecycle: inv.lifecycle, dueDate: inv.due_date },
    new Date(),
  )
  await ref.update({ payments, payment_status, updated_at: now })
}

export async function deleteInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) return
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'draft' && inv.lifecycle !== 'approved') {
    throw new Error('Cannot delete an issued invoice — void it instead')
  }
  await ref.delete()
}
