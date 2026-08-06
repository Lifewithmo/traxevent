import { describe, it, expect, vi, beforeEach } from 'vitest'

const createPaymentIntentSpy = vi.hoisted(() => vi.fn())
const proposalsGetSpy = vi.hoisted(() => vi.fn())
const proposalUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgGetSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn((name: string) => {
      if (name !== 'proposals') throw new Error(`unexpected collectionGroup(${name})`)
      return {
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: proposalsGetSpy,
          }),
        }),
      }
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: createPaymentIntentSpy,
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: getHeadersSpy,
}))

import { POST } from '@/app/api/payments/proposal-deposit/intent/route'

// Builds a snapshot whose single doc carries `data`, and a `ref` whose
// parent.parent is the org doc ref (orgs/{orgId}) — matching the real
// Firestore layout orgs/{orgId}/proposals/{proposalId}.
function mockProposalSnapshot(data: Record<string, unknown> | null, orgData?: Record<string, unknown> | null) {
  if (data === null) {
    proposalsGetSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  orgGetSpy.mockResolvedValue(
    orgData === null || orgData === undefined
      ? { exists: false, data: () => undefined }
      : { exists: true, data: () => orgData },
  )
  const orgRef = { get: orgGetSpy }
  const ref = {
    update: proposalUpdateSpy,
    parent: { parent: orgRef },
  }
  proposalsGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data, ref }],
  })
}

function sentBeforeAcceptProposal() {
  return {
    id: 'p1',
    org_id: 'org-1',
    lead_id: 'lead-1',
    token: 'tok-1',
    status: 'sent',
    line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
    packages: [{ id: 'good', name: 'Good', includes: [], price: 12500 }],
    deposit: { type: 'percent', value: 50 },
    deposit_gate: 'before_accept',
  }
}

function acceptedAfterAcceptProposal() {
  return {
    id: 'p2',
    org_id: 'org-1',
    lead_id: 'lead-1',
    token: 'tok-2',
    status: 'accepted',
    line_items: [],
    packages: [{ id: 'good', name: 'Good', includes: [], price: 12500 }],
    deposit: { type: 'percent', value: 50 },
    deposit_gate: 'after_accept',
    signature: { signer_name: 'Dana', signer_email: 'd@x.co', signed_at: 'x', ip: '1.2.3.4', user_agent: 'ua', consent_electronic: true, document_hash: 'a'.repeat(64) },
    selection: { package_id: 'good', optional_item_ids: [], selected_total: 12500, selected_at: 'x' },
    payment_status: 'deposit_pending',
  }
}

describe('POST /api/payments/proposal-deposit/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPaymentIntentSpy.mockResolvedValue({
      client_secret: 'pi_test_secret_xyz',
      id: 'pi_456',
    })
    getHeadersSpy.mockResolvedValue({
      get: (k: string) => (k === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : k === 'user-agent' ? 'JestUA/1.0' : null),
    })
  })

  it('before_accept: valid signer/consent/selection writes pending_signature THEN creates a PaymentIntent with server-computed amount, 1% fee, and proposal_deposit metadata', async () => {
    mockProposalSnapshot(sentBeforeAcceptProposal(), { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({
        token: 'tok-1',
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        consent: true,
        selection: { package_id: 'good', optional_item_ids: ['o1'] },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // pending_signature written BEFORE the intent is created
    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    const writeArg = proposalUpdateSpy.mock.calls[0][0]
    expect(writeArg.pending_signature).toMatchObject({
      signer_name: 'Dana',
      signer_email: 'd@x.co',
      ip: '203.0.113.7',
      user_agent: 'JestUA/1.0',
    })
    expect(writeArg.pending_signature.document_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(proposalUpdateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      createPaymentIntentSpy.mock.invocationCallOrder[0],
    )

    // total = 12500 (good) + 1500 (lighting) = 14000; deposit 50% = 7000 → 700000 cents
    expect(createPaymentIntentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 700000,
        currency: 'usd',
        application_fee_amount: 7000, // 1% of 700000
        metadata: { purpose: 'proposal_deposit', proposal_id: 'p1', token: 'tok-1' },
      }),
      { stripeAccount: 'acct_abc' },
    )
    const body = await res.json()
    expect(body).toEqual({ clientSecret: 'pi_test_secret_xyz', stripeAccountId: 'acct_abc' })
  })

  it('after_accept: an already-signed proposal creates a PaymentIntent from its locked selection, without touching pending_signature', async () => {
    mockProposalSnapshot(acceptedAfterAcceptProposal(), { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-2' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    // selected_total 12500, deposit 50% = 6250 → 625000 cents
    expect(createPaymentIntentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 625000,
        application_fee_amount: 6250,
        metadata: { purpose: 'proposal_deposit', proposal_id: 'p2', token: 'tok-2' },
      }),
      { stripeAccount: 'acct_abc' },
    )
  })

  it('the deposit amount is server-computed — a client-sent amount is ignored', async () => {
    mockProposalSnapshot(acceptedAfterAcceptProposal(), { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-2', amount: 999999 }),
    })
    await POST(req)
    expect(createPaymentIntentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 625000 }),
      { stripeAccount: 'acct_abc' },
    )
    const callArg = createPaymentIntentSpy.mock.calls[0][0]
    expect(callArg.amount).not.toBe(999999)
  })

  it('proposal without a deposit → 400', async () => {
    const noDeposit = { ...acceptedAfterAcceptProposal(), deposit: undefined }
    delete (noDeposit as Record<string, unknown>).deposit
    mockProposalSnapshot(noDeposit, { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-2' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  it('unknown token → 404', async () => {
    mockProposalSnapshot(null)
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({ token: 'nope' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  it('org without stripe_account_id → 400', async () => {
    mockProposalSnapshot(acceptedAfterAcceptProposal(), { id: 'org-1' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-2' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  it('before_accept: rejects missing consent without writing pending_signature or creating an intent', async () => {
    mockProposalSnapshot(sentBeforeAcceptProposal(), { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({
        token: 'tok-1',
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        consent: false,
        selection: { package_id: 'good', optional_item_ids: [] },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  it('before_accept: rejects an invalid package selection without writing anything', async () => {
    mockProposalSnapshot(sentBeforeAcceptProposal(), { id: 'org-1', stripe_account_id: 'acct_abc' })
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({
        token: 'tok-1',
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        consent: true,
        selection: { package_id: 'ghost', optional_item_ids: [] },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  // Regression: an expired `before_accept` proposal must not be able to start
  // a deposit payment — this is the same "no signing an expired proposal"
  // rule as signProposal, reached through the other door (pay-then-promote
  // instead of sign-then-pay). Nothing may be written and no PaymentIntent
  // may be created.
  it('before_accept: rejects an expired proposal without writing pending_signature or creating an intent', async () => {
    mockProposalSnapshot(
      { ...sentBeforeAcceptProposal(), expires_at: '2020-01-01T00:00:00.000Z' },
      { id: 'org-1', stripe_account_id: 'acct_abc' },
    )
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({
        token: 'tok-1',
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        consent: true,
        selection: { package_id: 'good', optional_item_ids: ['o1'] },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/expired/i)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(createPaymentIntentSpy).not.toHaveBeenCalled()
  })

  // Mirror-image: a future expiry does not interfere with the normal flow.
  it('before_accept: still proceeds when the expiry is in the future', async () => {
    mockProposalSnapshot(
      { ...sentBeforeAcceptProposal(), expires_at: '2999-01-01T00:00:00.000Z' },
      { id: 'org-1', stripe_account_id: 'acct_abc' },
    )
    const req = new Request('http://localhost/api/payments/proposal-deposit/intent', {
      method: 'POST',
      body: JSON.stringify({
        token: 'tok-1',
        signer_name: 'Dana',
        signer_email: 'd@x.co',
        consent: true,
        selection: { package_id: 'good', optional_item_ids: ['o1'] },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    expect(createPaymentIntentSpy).toHaveBeenCalledTimes(1)
  })
})
