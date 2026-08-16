'use server'

import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { previouslyBilled, assertWithinScope, acceptedProposalTotal } from '@/lib/invoice-progress'
import { assertEditable, assertSendEditable } from '@/lib/invoice-lock'
import { derivePaymentStatus } from '@/lib/invoice-status'
import { logActivity } from '@/lib/activity'
import { getProposal } from '@/actions/proposals'
import { getLead } from '@/actions/leads'
import { adminDb } from '@/lib/firebase-admin'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import {
  invoicesRef,
  invoiceCounterRef,
  listInvoicesCore,
  createInvoiceCore,
  generateFromProposalCore,
  recordPaymentCore,
  markInvoiceSentCore,
  assignNextInvoiceNumber,
  invoiceVersionSnapshot,
} from '@/lib/crm/invoices'
import { sendInvoiceEmail } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Event, Invoice, InvoiceLineItem, InvoiceType, InvoiceDiscount, NormalizedInvoice, Org } from '@/lib/types'

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
 * A converted job knows its own opportunity via Event.lead_id, so that is the
 * primary path; leadId is still accepted as the fallback for a manually
 * created event, or a linked one whose opportunity was since deleted.
 */
export async function generateCloseoutInvoice(orgId: string, eventId: string, leadId?: string): Promise<Invoice> {
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

  // A converted job knows its own opportunity. leadId is still accepted so a
  // manually-created event — or a linked one whose opportunity was deleted —
  // can be billed through the picker.
  const resolvedLeadId = leadId ?? event.lead_id
  if (!resolvedLeadId) throw new Error('No opportunity linked to this event')

  const lead = await getLead(orgId, resolvedLeadId)
  if (!lead) throw new Error('Lead not found')
  return createInvoiceCore(orgId, resolvedLeadId, {
    type: 'final',
    title: `Final invoice — ${event.name}`,
    line_items: packages.map((p) => ({ description: p.name, quantity: 1, unit_price: p.price })),
    customer_id: lead.customer_id,
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

export interface SendInvoiceInput {
  to: string
  message?: string
  updates?: InvoiceUpdate
}

/**
 * The proposal-scope guardrail for a send. `inv` must be the post-updates invoice, so the
 * amount asserted is what the customer is about to be billed.
 *
 * The invoice being sent is filtered out of the sibling list on purpose: on a resend it is
 * already `sent`, so previouslyBilled would count its CURRENT amount as prior billing and
 * then add the new amount on top — a plain resend of an at-scope invoice would fail, and a
 * raise would be measured against the wrong baseline. Excluding it makes `billed` mean
 * "what the OTHER sent invoices claim", which is the comparison the invariant wants. On a
 * first send the draft is not `sent`, so the filter is a no-op there.
 *
 * Not exported: this module is 'use server', where every export must be an async server
 * action — an internal helper must stay internal.
 */
async function assertSendWithinScope(orgId: string, invoiceId: string, inv: NormalizedInvoice): Promise<void> {
  if (inv.source?.type !== 'proposal' || !inv.source.id || inv.type === 'quick') return
  const proposal = await getProposal(orgId, inv.source.id)
  if (!proposal) return
  const approved = acceptedProposalTotal(proposal)
  const existing = await listInvoices(orgId, inv.lead_id)
  const billed = previouslyBilled(existing.filter((i) => i.id !== invoiceId), inv.source.id)
  assertWithinScope(invoiceAmountDue(inv), billed, approved)
}

/**
 * The one send motion (spec §6): apply any pending edits, assign the number on first
 * send, snapshot the content-as-sent into versions[], email the customer, and record
 * delivery. Email failure never rolls back the send — numbers must be unique, not
 * gapless — it surfaces as { emailDelivered: false } + delivery: 'bounced'.
 */
export async function sendInvoice(
  orgId: string,
  invoiceId: string,
  input: SendInvoiceInput,
): Promise<{ number: string; emailDelivered: boolean }> {
  const member = await assertOrgAdmin(orgId)
  if (!input.to.trim()) throw new Error('Recipient email is required')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const preSnap = await ref.get()
  if (!preSnap.exists) throw new Error('Invoice not found')
  let inv = normalizeInvoice(preSnap.data()!)
  if (inv.lifecycle === 'void') throw new Error('Cannot send a void invoice')

  if (input.updates) {
    // Send update is the ONLY write path onto a sent invoice, so this payload has to be
    // whitelisted the way updateInvoice's is: without it any org admin could pass
    // `number` (or type/source/credits) here and rewrite the counter-assigned number,
    // breaking the invariant that two invoices can never share one.
    assertSendEditable(Object.keys(input.updates))
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input.updates)) {
      cleaned[k] = v === undefined ? FieldValue.delete() : v
    }
    await ref.update({ ...cleaned, updated_at: new Date().toISOString() })
    inv = normalizeInvoice((await ref.get()).data()!)
  }

  // Scope invariant, verbatim from the retired issueInvoice: plain reads only —
  // Firestore transactions cannot run queries. Checked on EVERY send, not just the
  // first: a sent proposal-derived invoice is still editable through Send update, so
  // skipping the resend would let a $500 deposit be re-sent as $5000 against a $1000
  // proposal. `inv` is post-updates here, so the amount checked is the new one.
  await assertSendWithinScope(orgId, invoiceId, inv)

  const isUpdate = inv.lifecycle === 'sent'
  let number: string
  if (!isUpdate) {
    const res = await markInvoiceSentCore(orgId, invoiceId)
    number = res.number
  } else {
    let resentNumber = inv.number ?? ''
    const now = new Date().toISOString()
    // Resend: read-append-write must be one transaction. A bare ref.update() built from
    // an earlier read would let two concurrent resends (double-click, two admins) both
    // read the same versions[] and clobber each other's appended snapshot. Re-read inside
    // the transaction and snapshot that transaction-read content, not the outer `inv`.
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new Error('Invoice not found')
      const txInv = normalizeInvoice(snap.data()!)
      // Recheck inside the transaction: voidInvoice is a plain update outside it,
      // so an invoice voided since the pre-read would otherwise still be emailed.
      if (txInv.lifecycle === 'void') throw new Error('Cannot send a void invoice')
      // Legacy pre-lifecycle docs (`status: 'sent'`) reach the resend branch having never
      // burned a counter value, so they carry no number. Backfill one — the same
      // transactional bump as the first send, minus the lifecycle transition — or every
      // resend mails a blank invoice number and the editor keeps showing the draft's
      // "№ assigned when sent" placeholder on an invoice that is demonstrably sent.
      const backfilled = txInv.number ? undefined : await assignNextInvoiceNumber(tx, orgId)
      resentNumber = txInv.number ?? backfilled ?? ''
      tx.update(ref, {
        versions: [...(txInv.versions ?? []), invoiceVersionSnapshot(txInv, now)],
        ...(backfilled ? { number: backfilled } : {}),
        sent_at: now,
        updated_at: now,
      })
    })
    number = resentNumber
  }

  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.data() as Org | undefined
  let fromDomain: string | undefined
  try {
    fromDomain = await getVerifiedSendingDomain(orgId)
  } catch { /* fall back to platform sender */ }

  let emailDelivered = true
  try {
    await sendInvoiceEmail({
      to: input.to.trim(),
      orgName: org?.branding?.display_name ?? org?.name ?? 'Your vendor',
      invoiceNumber: number,
      total: invoiceAmountDue(inv),
      dueDate: inv.due_date,
      message: input.message,
      token: inv.token,
      isUpdate,
      fromDisplayName: org?.branding?.display_name ?? org?.name,
      fromDomain,
      replyTo: member.email,
    })
  } catch {
    emailDelivered = false
  }
  // Outside the try on purpose: this catch classifies EMAIL failure, so a Firestore
  // error on the status write must not be reported as a bounce — that would tell the
  // operator to resend an invoice the customer already received.
  await ref.update({ delivery: emailDelivered ? 'sent' : 'bounced' })
  return { number, emailDelivered }
}

export async function voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'sent') {
    if (inv.lifecycle === 'draft') throw new Error('Only a sent invoice can be voided — delete the draft instead')
    throw new Error('Invoice is already void')
  }
  const now = new Date().toISOString()
  await ref.update({
    lifecycle: 'void',
    updated_at: now,
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
}

export interface RecordPaymentInput {
  amount: number
  method?: string
  note?: string
  tip_amount?: number
}

// derivePaymentStatus over the invoice's own amount-due/amount-paid, at a point in time.
// Used to detect the specific payment that TRANSITIONS an invoice to paid — not just
// "is it paid now" — so a later payment recorded against an already-paid invoice
// doesn't log a second event.
function paymentStatusOf(inv: NormalizedInvoice) {
  return derivePaymentStatus(
    { total: invoiceAmountDue(inv), applied: amountPaid(inv.payments ?? []), lifecycle: inv.lifecycle, dueDate: inv.due_date },
    new Date(),
  )
}

export async function recordPayment(orgId: string, invoiceId: string, input: RecordPaymentInput): Promise<void> {
  await assertOrgAdmin(orgId)

  // Best-effort "before" snapshot for the paid-transition check below.
  // Deliberately swallowed: recordPaymentCore below does its own authoritative
  // read/validation (amount > 0, not void, invoice exists) — this extra,
  // earlier read must never pre-empt or change those errors.
  let beforeStatus: ReturnType<typeof paymentStatusOf> | undefined
  try {
    const before = await getInvoice(orgId, invoiceId)
    beforeStatus = before ? paymentStatusOf(before) : undefined
  } catch {
    beforeStatus = undefined
  }

  await recordPaymentCore(orgId, invoiceId, input)

  // Best-effort activity log, after the authoritative payment write above.
  // Only the payment that closes the balance (transitions TO paid/overpaid)
  // logs — a partial payment, or a payment recorded on an already-paid
  // invoice, does not.
  if (beforeStatus !== 'paid' && beforeStatus !== 'overpaid') {
    try {
      const after = await getInvoice(orgId, invoiceId)
      const afterStatus = after ? paymentStatusOf(after) : undefined
      if (after && (afterStatus === 'paid' || afterStatus === 'overpaid')) {
        await logActivity(orgId, {
          parent_type: 'opportunity',
          parent_id: after.lead_id,
          kind: 'invoice',
          summary: `Invoice paid — $${invoiceAmountDue(after).toFixed(2)}`,
        })
      }
    } catch {
      // best-effort; never fail an already-successful payment write
    }
  }
}

export async function deleteInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) return
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'draft') throw new Error('Cannot delete a sent invoice — void it instead')
  await ref.delete()
}

export async function getInvoiceNumbering(orgId: string): Promise<{ prefix?: string; next_number: number }> {
  await assertOrgAdmin(orgId)
  const snap = await invoiceCounterRef(orgId).get()
  const data = snap.exists ? (snap.data() as { seq: number; prefix?: string }) : undefined
  return { ...(data?.prefix ? { prefix: data.prefix } : {}), next_number: (data?.seq ?? 1000) + 1 }
}

export async function updateInvoiceNumbering(
  orgId: string,
  input: { prefix?: string; next_number?: number },
): Promise<void> {
  await assertOrgAdmin(orgId)
  await adminDb.runTransaction(async (tx) => {
    const ref = invoiceCounterRef(orgId)
    const snap = await tx.get(ref)
    const seq = snap.exists ? (snap.data() as { seq: number }).seq : 1000
    const payload: Record<string, unknown> = {}
    if (input.next_number != null) {
      if (!Number.isInteger(input.next_number) || input.next_number <= seq) {
        throw new Error(`Next number must be greater than ${seq} (already used)`)
      }
      payload.seq = input.next_number - 1
    }
    if (input.prefix !== undefined) {
      const trimmed = input.prefix.trim()
      if (trimmed) payload.prefix = trimmed
      else payload.prefix = FieldValue.delete()
    }
    if (Object.keys(payload).length > 0) tx.set(ref, payload, { merge: true })
  })
}
