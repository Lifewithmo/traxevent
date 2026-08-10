import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import { normalizeInvoice, formatInvoiceNumber } from '@/lib/invoice-normalize'
import {
  previouslyBilled,
  assertWithinScope,
  acceptedProposalTotal,
  proposalInvoiceLines,
} from '@/lib/invoice-progress'
import { depositAmount } from '@/lib/proposals'
import { derivePaymentStatus } from '@/lib/invoice-status'
import { leadsRef } from '@/lib/crm/leads'
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceType,
  InvoiceDiscount,
  InvoiceCredit,
  NormalizedInvoice,
  Proposal,
  Lead,
} from '@/lib/types'

// NOTE: this is a plain lib module (NOT 'use server') — it can export types freely,
// unlike actions/invoices.ts which must not re-export types (breaks `next build`).

export function invoicesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('invoices')
}

export interface CreateInvoiceCoreInput {
  title?: string
  number?: string
  line_items?: InvoiceLineItem[]
  notes?: string
  due_date?: string
  type?: InvoiceType
  customer_id?: string
}

export interface RecordPaymentCoreInput {
  amount: number
  method?: string
  note?: string
  tip_amount?: number
}

/** Guard-free org-wide invoice list. Performs no auth. */
export async function listAllInvoicesCore(orgId: string): Promise<NormalizedInvoice[]> {
  const snap = await invoicesRef(orgId).get()
  return snap.docs.map((d) => normalizeInvoice(d.data()))
}

/** Guard-free invoice list. Performs no auth. */
export async function listInvoicesCore(orgId: string, leadId: string): Promise<NormalizedInvoice[]> {
  const snap = await invoicesRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => normalizeInvoice(d.data()))
}

/** Guard-free invoice creation. Takes `customer_id` directly instead of fetching the lead. */
export async function createInvoiceCore(orgId: string, leadId: string, input: CreateInvoiceCoreInput): Promise<Invoice> {
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
    ...(input.customer_id ? { customer_id: input.customer_id } : {}),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.number?.trim() ? { number: input.number.trim() } : {}),
    ...(input.due_date?.trim() ? { due_date: input.due_date.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await invoicesRef(orgId).doc(id).set(invoice)
  return invoice
}

/**
 * Guard-free invoice generation from an accepted proposal. Takes the pre-fetched
 * `proposal` and `existingInvoices` (instead of calling getProposal/listInvoices) so it
 * is safe to call from an unauthenticated context (e.g. the deposit webhook). Resolves
 * `customer_id` itself via `leadsRef`, since no guarded `getLead` is available there.
 */
export async function generateFromProposalCore(
  orgId: string,
  leadId: string,
  proposal: Proposal,
  existingInvoices: NormalizedInvoice[],
  opts: { type: InvoiceType },
): Promise<Invoice> {
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'accepted') throw new Error('Proposal is not accepted')

  const accepted = acceptedProposalTotal(proposal)
  const billed = previouslyBilled(existingInvoices, proposal.id)

  const source = { type: 'proposal' as const, id: proposal.id, label: 'Accepted proposal' }
  const lineSource = { type: 'proposal' as const, id: proposal.id }
  const itemLines = proposalInvoiceLines(proposal).map((l) => ({ ...l, source: lineSource }))

  let line_items: InvoiceLineItem[]
  let discount: InvoiceDiscount | undefined
  let tax_rate: number | undefined
  let credits: InvoiceCredit[] | undefined
  switch (opts.type) {
    case 'quick':
      line_items = itemLines
      discount = proposal.discount
      tax_rate = proposal.tax_rate
      break
    case 'final':
      line_items = itemLines
      discount = proposal.discount
      tax_rate = proposal.tax_rate
      if (billed > 0) credits = [{ description: 'Less: previously billed', amount: billed }]
      break
    case 'deposit':
      line_items = [{ description: 'Deposit', quantity: 1, unit_price: depositAmount(accepted, proposal.deposit), source: lineSource }]
      break
    default: // progress
      line_items = [{ description: 'Progress payment', quantity: 1, unit_price: 0, source: lineSource }]
  }

  if (opts.type !== 'quick') {
    assertWithinScope(invoiceAmountDue({ line_items, discount, tax_rate, credits }), billed, accepted)
  }

  const leadSnap = await leadsRef(orgId).doc(leadId).get()
  const lead = leadSnap.exists ? (leadSnap.data() as Lead) : null

  const invoice = await createInvoiceCore(orgId, leadId, { type: opts.type, line_items, customer_id: lead?.customer_id ?? undefined })
  await invoicesRef(orgId)
    .doc(invoice.id)
    .update({
      source,
      ...(discount ? { discount } : {}),
      ...(tax_rate ? { tax_rate } : {}),
      ...(credits ? { credits } : {}),
    })
  return {
    ...invoice,
    source,
    ...(discount ? { discount } : {}),
    ...(tax_rate ? { tax_rate } : {}),
    ...(credits ? { credits } : {}),
  }
}

/**
 * Guard-free invoice issuance: assigns the next sequential invoice number and locks
 * the invoice to `lifecycle: 'issued'`. Performs no auth and no scope-invariant check
 * (callers that need the proposal-scope guardrail — e.g. `issueInvoice` — must run it
 * themselves before delegating here, since it requires a plain, non-transaction query).
 *
 * `opts.issuedAt` lets a caller backdate `issued_at` to an external event's own
 * timestamp (e.g. the Stripe payment's `paid_at`, in the deposit reconciler) instead of
 * "now".
 */
export async function issueInvoiceCore(
  orgId: string,
  invoiceId: string,
  opts?: { issuedAt?: string },
): Promise<{ number: string }> {
  const ref = invoicesRef(orgId).doc(invoiceId)
  const counterRef = adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')

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
    const issued_at = opts?.issuedAt ?? now

    tx.set(counterRef, { seq }, { merge: true })
    tx.set(ref, { lifecycle: 'issued', number, issued_at, updated_at: now }, { merge: true })
    return { number }
  })
}

/** Guard-free payment recording. Performs no auth. */
export async function recordPaymentCore(orgId: string, invoiceId: string, input: RecordPaymentCoreInput): Promise<void> {
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
  const total = invoiceAmountDue(inv)
  const applied = amountPaid(payments)
  const payment_status = derivePaymentStatus(
    { total, applied, lifecycle: inv.lifecycle, dueDate: inv.due_date },
    new Date(),
  )
  await ref.update({ payments, payment_status, updated_at: now })
}
