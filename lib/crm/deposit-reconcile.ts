import { adminDb } from '@/lib/firebase-admin'
import { invoicesRef, listInvoicesCore, generateFromProposalCore, recordPaymentCore } from '@/lib/crm/invoices'
import type { Proposal } from '@/lib/types'

/**
 * Idempotent deposit reconciler: given a succeeded Stripe payment against an
 * accepted proposal, ensures exactly one `deposit` invoice exists for that
 * proposal with the payment recorded on it. Guard-free — runs from the
 * unauthenticated payments webhook, so it re-derives everything it needs
 * (the proposal via collectionGroup, the lead's invoices) rather than relying
 * on a caller-supplied session.
 *
 * Safe to call more than once for the same Stripe event:
 *  - no deposit invoice yet            → create one, record the payment.
 *  - deposit invoice exists, unpaid    → record the payment onto it (covers
 *                                         admin-generated invoices and retries
 *                                         after a partial failure).
 *  - deposit invoice exists, paid      → no-op.
 */
export async function reconcileProposalDeposit(
  orgId: string,
  leadId: string,
  proposalId: string,
  payment: { intent_id: string; amount: number; paid_at: string },
): Promise<void> {
  const pSnap = await adminDb.collectionGroup('proposals').where('id', '==', proposalId).limit(1).get()
  if (pSnap.empty) return
  const proposal = pSnap.docs[0].data() as Proposal
  if (proposal.status !== 'accepted') return // nothing to reconcile against

  // Defense-in-depth: this runs guard-free from the unauthenticated webhook.
  // Never let a caller-supplied orgId/leadId that doesn't match the resolved
  // proposal's own scope cause a write into the wrong org's invoices.
  if (proposal.org_id !== orgId || proposal.lead_id !== leadId) return

  const existing = await listInvoicesCore(orgId, leadId)
  // Exclude terminal lifecycles: a voided/replaced deposit invoice must never
  // be matched here — matching it would resurrect it (lifecycle flipped back
  // to 'issued' below, before recordPaymentCore's own voided/replaced guard
  // even runs) instead of falling through to create a fresh deposit invoice.
  const depositInv = existing.find(
    (i) => i.type === 'deposit' && i.source?.id === proposalId && i.lifecycle !== 'voided' && i.lifecycle !== 'replaced',
  )

  if (depositInv) {
    if ((depositInv.payments?.length ?? 0) > 0) return // already reconciled → no-op
    // Lifecycle write happens BEFORE the payment write: the idempotency check
    // above keys on payments.length, so if a prior attempt failed partway
    // through, a retry must still be able to re-do the lifecycle update and
    // record the payment as the final, defining step of "reconciled."
    await invoicesRef(orgId).doc(depositInv.id).update({ lifecycle: 'issued', issued_at: payment.paid_at })
    await recordPaymentCore(orgId, depositInv.id, {
      amount: payment.amount,
      method: 'card',
      note: `Stripe deposit ${payment.intent_id}`,
    })
    return
  }

  const created = await generateFromProposalCore(orgId, leadId, proposal, existing, { type: 'deposit' })
  await invoicesRef(orgId).doc(created.id).update({ lifecycle: 'issued', issued_at: payment.paid_at })
  await recordPaymentCore(orgId, created.id, {
    amount: payment.amount,
    method: 'card',
    note: `Stripe deposit ${payment.intent_id}`,
  })
}
