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
  const orgRef = { collection: vi.fn().mockReturnValue({ doc: leadDocSpy }) }
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
  })

  describe('proposal_deposit', () => {
    function pendingSignatureProposal() {
      return {
        id: 'prop-1',
        lead_id: 'lead-1',
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
      // pending_signature is cleared via FieldValue.delete() — never left on the doc
      expect(arg.pending_signature).toBeDefined()

      expect(leadDocSpy).toHaveBeenCalledWith('lead-1')
      expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
    })

    it('before_accept: a second identical event is a no-op (idempotent)', async () => {
      // Simulates the doc state AFTER the first webhook already finalized it.
      mockProposalSnapshot({
        id: 'prop-1', lead_id: 'lead-1', status: 'accepted', payment_status: 'deposit_paid',
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
    })
  })
})
