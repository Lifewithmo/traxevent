import { describe, it, expect, vi, beforeEach } from 'vitest'

const familyUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const eventGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }))
const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

const familiesGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))
const proposalsGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))
const proposalUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocSpy = vi.hoisted(() => vi.fn().mockReturnValue({ update: leadUpdateSpy }))
const sendProposalSignedConfirmationSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const sendRegistrationConfirmationSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getVerifiedSendingDomainSpy = vi.hoisted(() => vi.fn().mockResolvedValue('mail.acme.com'))
const reconcileProposalDepositSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/email', () => ({
  sendRegistrationConfirmation: sendRegistrationConfirmationSpy,
  sendProposalSignedConfirmation: sendProposalSignedConfirmationSpy,
}))
vi.mock('@/actions/domains', () => ({
  getVerifiedSendingDomain: getVerifiedSendingDomainSpy,
}))
vi.mock('@/lib/crm/deposit-reconcile', () => ({
  reconcileProposalDeposit: reconcileProposalDepositSpy,
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn((name: string) => {
      if (name === 'proposals') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: proposalsGetSpy,
            }),
          }),
        }
      }
      // 'families' (existing path)
      return {
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: familiesGetSpy,
          }),
        }),
      }
    }),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: eventGetSpy,
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventSpy,
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: getHeadersSpy,
}))

import { POST } from '@/app/api/payments/webhook/route'

// Builds a `proposals` collectionGroup snapshot whose single doc carries
// `data`, and a `ref` whose parent.parent is the org doc ref — matching the
// real Firestore layout orgs/{orgId}/proposals/{proposalId} and giving the
// webhook a path to orgs/{orgId}/leads/{leadId} for the closed_won advance.
function mockProposalSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    proposalsGetSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  const orgRef = { id: 'org-1', collection: vi.fn().mockReturnValue({ doc: leadDocSpy }) }
  const ref = {
    update: proposalUpdateSpy,
    parent: { parent: orgRef },
  }
  proposalsGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data, ref }],
  })
}

function succeededEvent(metadata: Record<string, string>, amount = 625000) {
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_dep_1',
        amount,
        metadata,
      },
    },
  }
}

function makeRequest() {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    body: '{"type":"payment_intent.succeeded"}',
  })
}

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => (key === 'stripe-signature' ? 'test-sig' : null),
    })
    familiesGetSpy.mockResolvedValue({ empty: true, docs: [] })
    proposalsGetSpy.mockResolvedValue({ empty: true, docs: [] })
  })

  it('returns 400 on invalid signature', async () => {
    constructEventSpy.mockImplementation(() => { throw new Error('Bad sig') })
    const req = new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    // a bad signature must 400 before any reconcile runs
    expect(reconcileProposalDepositSpy).not.toHaveBeenCalled()
  })

  it('marks family as paid on payment_intent.succeeded', async () => {
    familiesGetSpy.mockResolvedValue({
      empty: false,
      docs: [{
        ref: { update: familyUpdateSpy },
        data: () => ({
          id: 'fam-1',
          payment_status: 'unpaid',
          org_id: 'org-1',
          event_id: 'camp-1',
          first_name: 'Jane',
          email: 'jane@example.com',
          event_name: 'Spring Gathering',
          org_name: 'Test Org',
          org_slug: 'test-org',
          event_slug: 'spring-gathering',
          access_token: null,
        }),
      }],
    })
    constructEventSpy.mockReturnValue(succeededEvent({ familyId: 'fam-1' }, 15000))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(familyUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        amount_paid: 150, // 15000 cents → $150
      })
    )
    expect(reconcileProposalDepositSpy).not.toHaveBeenCalled()
  })

  describe('proposal_deposit', () => {
    function pendingSignatureProposal() {
      return {
        id: 'prop-1',
        lead_id: 'lead-1',
        token: 'ptok-1',
        status: 'sent',
        payment_status: 'deposit_pending',
        line_items: [],
        pending_signature: {
          signer_name: 'Dana',
          signer_email: 'd@x.co',
          captured_at: '2026-08-01T00:00:00.000Z',
          ip: '203.0.113.7',
          user_agent: 'JestUA/1.0',
          document_hash: 'a'.repeat(64),
          selection: { package_id: 'good', optional_item_ids: [], selected_total: 12500, selected_at: '2026-08-01T00:00:00.000Z' },
        },
      }
    }

    function alreadySignedProposal() {
      return {
        id: 'prop-2',
        lead_id: 'lead-2',
        status: 'accepted',
        payment_status: 'deposit_pending',
        line_items: [],
        signature: {
          signer_name: 'Alex', signer_email: 'a@x.co', signed_at: '2026-07-01T00:00:00.000Z',
          ip: '198.51.100.1', user_agent: 'UA', consent_electronic: true, document_hash: 'b'.repeat(64),
        },
        selection: { package_id: 'good', optional_item_ids: [], selected_total: 12500, selected_at: '2026-07-01T00:00:00.000Z' },
      }
    }

    it('before_accept: finalizes accepted + deposit_paid, promotes pending_signature, and advances closed_won', async () => {
      mockProposalSnapshot(pendingSignatureProposal())
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'prop-1', token: 'tok-1' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)

      expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
      const arg = proposalUpdateSpy.mock.calls[0][0]
      expect(arg.status).toBe('accepted')
      expect(arg.payment_status).toBe('deposit_paid')
      expect(arg.selection).toEqual({ package_id: 'good', optional_item_ids: [], selected_total: 12500, selected_at: '2026-08-01T00:00:00.000Z' })
      expect(arg.signature).toMatchObject({
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        ip: '203.0.113.7',
        user_agent: 'JestUA/1.0',
        consent_electronic: true,
        document_hash: 'a'.repeat(64),
      })
      expect(arg.deposit_payment).toMatchObject({ intent_id: 'pi_dep_1', amount: 6250 })
      // pending_signature is cleared via FieldValue.delete() — never left on the doc.
      // Asserting the exact delete sentinel (not just `toBeDefined()`, which the
      // sentinel object trivially satisfies) so a regression that stopped
      // clearing the stash — e.g. accidentally writing back the raw
      // pending_signature object instead of deleting it — is caught.
      const { FieldValue } = await import('firebase-admin/firestore')
      expect(arg.pending_signature).toEqual(FieldValue.delete())

      expect(leadDocSpy).toHaveBeenCalledWith('lead-1')
      expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))

      // Fix 2 + Fix 3: the before_accept path sends the same signed-confirmation
      // email the after_accept path sends when it first signs — using the
      // promoted signer's name/email, the proposal's own token, and the org's
      // verified sending domain (resolved the same way the registration
      // webhook does via getVerifiedSendingDomain).
      expect(getVerifiedSendingDomainSpy).toHaveBeenCalledWith('org-1')
      expect(sendProposalSignedConfirmationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'd@x.co',
          signerName: 'Dana',
          token: 'ptok-1',
          fromDomain: 'mail.acme.com',
        }),
      )

      // reconcile runs on the first-finalize delivery too, after the proposal
      // has been finalized to accepted — org/lead/proposal ids all derived
      // from the resolved doc, never from unverified client input.
      expect(reconcileProposalDepositSpy).toHaveBeenCalledTimes(1)
      expect(reconcileProposalDepositSpy).toHaveBeenCalledWith(
        'org-1', 'lead-1', 'prop-1',
        { intent_id: 'pi_dep_1', amount: 6250, paid_at: expect.any(String) },
      )
    })

    it('before_accept: a verified-domain lookup failure does not block the confirmation email (best-effort fallback)', async () => {
      getVerifiedSendingDomainSpy.mockRejectedValueOnce(new Error('firestore down'))
      mockProposalSnapshot(pendingSignatureProposal())
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'prop-1', token: 'tok-1' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(sendProposalSignedConfirmationSpy).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'd@x.co', signerName: 'Dana', fromDomain: undefined }),
      )
    })

    it('before_accept: a confirmation-email failure does not fail the webhook', async () => {
      sendProposalSignedConfirmationSpy.mockRejectedValueOnce(new Error('resend down'))
      mockProposalSnapshot(pendingSignatureProposal())
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'prop-1', token: 'tok-1' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(proposalUpdateSpy).toHaveBeenCalledTimes(1) // the finalize write still happened
    })

    it('before_accept: a second identical event skips the finalize (no duplicate proposal/lead write) but still reconciles', async () => {
      // Simulates the doc state AFTER the first webhook already finalized it.
      // The finalize is guarded by payment_status !== 'deposit_paid' (skipped
      // here), but reconcile must run on every delivery — idempotency for the
      // invoice/payment side lives inside the reconciler itself, not here.
      mockProposalSnapshot({
        id: 'prop-1', lead_id: 'lead-1', org_id: 'org-1', status: 'accepted', payment_status: 'deposit_paid',
        line_items: [],
        signature: { signer_name: 'Dana', signer_email: 'd@x.co', signed_at: 'x', ip: '1.2.3.4', user_agent: 'ua', consent_electronic: true, document_hash: 'a'.repeat(64) },
        selection: { package_id: 'good', optional_item_ids: [], selected_total: 12500, selected_at: 'x' },
      })
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'prop-1', token: 'tok-1' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(proposalUpdateSpy).not.toHaveBeenCalled()
      expect(leadUpdateSpy).not.toHaveBeenCalled()
      expect(sendProposalSignedConfirmationSpy).not.toHaveBeenCalled()
      expect(reconcileProposalDepositSpy).toHaveBeenCalledTimes(1)
      expect(reconcileProposalDepositSpy).toHaveBeenCalledWith(
        'org-1', 'lead-1', 'prop-1',
        { intent_id: 'pi_dep_1', amount: 6250, paid_at: expect.any(String) },
      )
    })

    it('after_accept: an already-signed proposal just sets deposit_paid, without re-advancing the lead', async () => {
      mockProposalSnapshot(alreadySignedProposal())
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'prop-2', token: 'tok-2' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)

      expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
      const arg = proposalUpdateSpy.mock.calls[0][0]
      expect(arg.payment_status).toBe('deposit_paid')
      expect(arg.status).toBeUndefined()
      expect(arg.selection).toBeUndefined()
      expect(arg.signature).toBeUndefined()
      expect(leadUpdateSpy).not.toHaveBeenCalled()
      // already signed via signProposal (after_accept) — that path already sent
      // its own confirmation email when the signer originally signed, so the
      // webhook must not send a second one here.
      expect(sendProposalSignedConfirmationSpy).not.toHaveBeenCalled()

      // first-finalize delivery on the after_accept path: reconcile still runs,
      // scoped to this proposal's own org/lead/id.
      expect(reconcileProposalDepositSpy).toHaveBeenCalledTimes(1)
      expect(reconcileProposalDepositSpy).toHaveBeenCalledWith(
        'org-1', 'lead-2', 'prop-2',
        { intent_id: 'pi_dep_1', amount: 6250, paid_at: expect.any(String) },
      )
    })

    it('unknown proposal_id → ok, no writes', async () => {
      mockProposalSnapshot(null)
      constructEventSpy.mockReturnValue(
        succeededEvent({ purpose: 'proposal_deposit', proposal_id: 'ghost', token: 'tok-x' }, 625000),
      )
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(proposalUpdateSpy).not.toHaveBeenCalled()
      expect(leadUpdateSpy).not.toHaveBeenCalled()
      expect(reconcileProposalDepositSpy).not.toHaveBeenCalled()
    })
  })
})
