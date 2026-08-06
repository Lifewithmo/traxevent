'use server'

import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { invoiceAmountDue } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { previouslyBilled, assertWithinScope, acceptedProposalTotal } from '@/lib/invoice-progress'
import { assertEditable } from '@/lib/invoice-lock'
import { getProposal } from '@/actions/proposals'
import { getLead } from '@/actions/leads'
import { adminDb } from '@/lib/firebase-admin'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import {
  invoicesRef,
  listInvoicesCore,
  createInvoiceCore,
  generateFromProposalCore,
  recordPaymentCore,
  issueInvoiceCore,
} from '@/lib/crm/invoices'
import type { Event, Invoice, InvoiceLineItem, InvoiceType, InvoiceDiscount, NormalizedInvoice } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// CreateInvoiceInput/InvoiceUpdate/RecordPaymentInput (types) are therefore NOT
// re-exported from '@/lib/crm/invoices'; they are declared locally here. Re-exporting
// a type from a 'use server' module broke `next build` (RSC compiler) — see AGENTS.md.

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
  return listInvoicesCore(orgId, leadId)
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
  return createInvoiceCore(orgId, leadId, { ...input, customer_id: lead?.customer_id })
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

  const existing = await listInvoices(orgId, leadId)
  return generateFromProposalCore(orgId, leadId, proposal, existing, opts)
}

/**
 * Closeout → invoicing seam (spec §4.4). Bills the plan's packages at catalog
 * price. Margin/cost numbers are internal and never appear on the invoice.
 * Event↔lead linkage doesn't exist yet, so the caller picks the lead.
 */
export async function generateCloseoutInvoice(orgId: string, eventId: string, leadId: string): Promise<Invoice> {
  await assertOrgAdmin(orgId)

  const closeout = await getCloseoutCore(orgId, eventId)
  if (!closeout?.completed) throw new Error('Complete closeout before generating the final invoice')

  const plan = await getOpsPlanCore(orgId, eventId)
  if (!plan) throw new Error('No ops plan for this event')

  const packages = await getWorkPackagesByIdsCore(orgId, plan.package_ids)
  const found = new Set(packages.map((p) => p.id))
  for (const id of plan.package_ids) {
    if (!found.has(id)) throw new Error(`Package no longer exists: ${id}`)
  }

  const eventSnap = await adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).get()
  if (!eventSnap.exists) throw new Error('Event not found')
  const event = eventSnap.data() as Event

  const lead = await getLead(orgId, leadId)
  return createInvoiceCore(orgId, leadId, {
    type: 'final',
    title: `Final invoice — ${event.name}`,
    line_items: packages.map((p) => ({ description: p.name, quantity: 1, unit_price: p.price })),
    customer_id: lead?.customer_id,
  })
}

export interface InvoiceUpdate {
  type?: InvoiceType
  title?: string
  number?: string
  notes?: string
  due_date?: string
  line_items?: InvoiceLineItem[]
  discount?: InvoiceDiscount
  tax_rate?: number
}

export async function updateInvoice(orgId: string, invoiceId: string, updates: InvoiceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  assertEditable(inv.lifecycle, Object.keys(updates))

  // Firestore rejects `undefined` (ignoreUndefinedProperties is off). The invoice editor always
  // sends its full pricing-terms state, so an `undefined` value here means "the user cleared this
  // field" — map it to FieldValue.delete() rather than dropping the key (which would leave a
  // stale discount/tax_rate in Firestore) or passing it raw (which throws). Mirrors updateProposal.
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    cleaned[k] = v === undefined ? FieldValue.delete() : v
  }
  await ref.update({ ...cleaned, updated_at: new Date().toISOString() })
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

  // Enforce the scope invariant at issue time, mirroring generateFromProposal's
  // in-memory check. This must happen with plain (non-transaction) reads —
  // Firestore transactions cannot run queries — so it's done before we ever
  // delegate to issueInvoiceCore's transaction below.
  const preSnap = await ref.get()
  if (!preSnap.exists) throw new Error('Invoice not found')
  const preInv = normalizeInvoice(preSnap.data()!)
  if (preInv.source?.type === 'proposal' && preInv.source.id && preInv.type !== 'quick') {
    const proposal = await getProposal(orgId, preInv.source.id)
    if (proposal) {
      const approved = acceptedProposalTotal(proposal)
      const existing = await listInvoices(orgId, preInv.lead_id)
      const billed = previouslyBilled(existing, preInv.source.id)
      assertWithinScope(invoiceAmountDue(preInv), billed, approved)
    }
  }

  return issueInvoiceCore(orgId, invoiceId)
}

export async function voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'issued') {
    if (inv.lifecycle === 'draft' || inv.lifecycle === 'approved') {
      throw new Error('Only an issued invoice can be voided — delete the draft instead')
    }
    throw new Error(`Invoice is already ${inv.lifecycle} and cannot be voided`)
  }
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
  if (original.lifecycle !== 'issued') {
    throw new Error('Only an issued invoice can be replaced')
  }
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
  return recordPaymentCore(orgId, invoiceId, input)
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
