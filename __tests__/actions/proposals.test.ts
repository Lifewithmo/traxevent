import { describe, it, expect, vi, beforeEach } from 'vitest'

const proposalDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const proposalDocGetSpy = vi.hoisted(() => vi.fn())
const proposalDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const proposalDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listProposalsSpy = vi.hoisted(() => vi.fn())
const listAllProposalsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const proposalsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-proposal-id',
      set: proposalDocSetSpy,
      get: proposalDocGetSpy,
      update: proposalDocUpdateSpy,
      delete: proposalDocDeleteSpy,
    })),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: listProposalsSpy }),
    }),
    orderBy: vi.fn().mockReturnValue({ get: listAllProposalsSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'proposals') return proposalsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('@/lib/tokens', () => ({
  generateAccessToken: vi.fn().mockReturnValue('tok_test'),
}))

import {
  listProposals,
  listAllProposals,
  getProposal,
  createProposal,
  updateProposal,
  sendProposal,
  deleteProposal,
  voidProposal,
} from '@/actions/proposals'

describe('proposals actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: doc exists, unsigned, no payment in flight — matches most
    // callers here who never set up their own get() response. Tests that
    // care about a specific stored state override this explicitly.
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({}) })
  })

  it('createProposal writes a proposal with generated id, token, org/lead, draft status, created_at, and passed fields', async () => {
    const proposal = await createProposal('org-1', 'lead-1', {
      title: 'Wedding Package',
      line_items: [{ description: 'DJ', quantity: 1, unit_price: 500 }],
    })
    expect(proposalDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        lead_id: 'lead-1',
        token: 'tok_test',
        status: 'draft',
        title: 'Wedding Package',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 500 }],
        created_at: expect.any(String),
      })
    )
    expect(proposal.id).toBeTruthy()
    expect(proposal.token).toBe('tok_test')
    expect(proposal.org_id).toBe('org-1')
    expect(proposal.lead_id).toBe('lead-1')
    expect(proposal.status).toBe('draft')
    expect(proposal.title).toBe('Wedding Package')
  })

  it('createProposal defaults line_items to [] when omitted', async () => {
    const proposal = await createProposal('org-1', 'lead-1', {})
    const written = proposalDocSetSpy.mock.calls[0][0]
    expect(written.line_items).toEqual([])
    expect(proposal.line_items).toEqual([])
  })

  it('listProposals filters by lead_id, orders by created_at desc, and returns mapped docs', async () => {
    listProposalsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'p1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }) }],
    })
    const list = await listProposals('org-1', 'lead-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('p1')
  })

  it('listAllProposals returns every proposal across leads ordered by created_at desc (no lead filter)', async () => {
    listAllProposalsSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'p1', lead_id: 'lead-1', status: 'draft', created_at: 'b' }) },
        { data: () => ({ id: 'p2', lead_id: 'lead-2', status: 'sent', created_at: 'a' }) },
      ],
    })
    const list = await listAllProposals('org-1')
    expect(list).toHaveLength(2)
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(list.map((p) => p.lead_id)).toEqual(['lead-1', 'lead-2'])
  })

  it('getProposal returns null when the doc does not exist', async () => {
    proposalDocGetSpy.mockResolvedValue({ exists: false })
    const proposal = await getProposal('org-1', 'missing')
    expect(proposal).toBeNull()
  })

  it('getProposal returns the proposal data when it exists', async () => {
    proposalDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'p1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }),
    })
    const proposal = await getProposal('org-1', 'p1')
    expect(proposal).not.toBeNull()
    expect(proposal?.id).toBe('p1')
  })

  it('updateProposal passes through title/notes/line_items/status and always sets updated_at', async () => {
    await updateProposal('org-1', 'p1', {
      title: 'Updated',
      notes: 'hello',
      line_items: [{ description: 'DJ', quantity: 2, unit_price: 250 }],
      status: 'sent',
    })
    const written = proposalDocUpdateSpy.mock.calls[0][0]
    expect(written.title).toBe('Updated')
    expect(written.notes).toBe('hello')
    expect(written.line_items).toEqual([{ description: 'DJ', quantity: 2, unit_price: 250 }])
    expect(written.status).toBe('sent')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateProposal throws "Invalid status" for a bad status and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid status at runtime
      updateProposal('org-1', 'p1', { status: 'nope' })
    ).rejects.toThrow('Invalid status')
    expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('updateProposal rejects status: "voided" — voiding must go through voidProposal (with a reason) and does not write', async () => {
    await expect(updateProposal('org-1', 'p1', { status: 'voided' })).rejects.toThrow(
      'Use voidProposal to void a proposal'
    )
    expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('sendProposal updates status to sent and sets updated_at', async () => {
    await sendProposal('org-1', 'p1')
    expect(proposalDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', updated_at: expect.any(String) })
    )
  })

  it('deleteProposal calls .delete()', async () => {
    await deleteProposal('org-1', 'p1')
    expect(proposalDocDeleteSpy).toHaveBeenCalled()
  })

  it('updateProposal passes through packages/discount/tax_rate/deposit/expires_at', async () => {
    await updateProposal('org-1', 'p1', {
      packages: [{ id: 'good', name: 'Good', includes: ['A'], price: 12500 }],
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      discount: { type: 'percent', value: 10 },
      tax_rate: 8.25,
      deposit: { type: 'percent', value: 50 },
      expires_at: '2026-09-01',
    })
    const written = proposalDocUpdateSpy.mock.calls[0][0]
    expect(written.packages).toEqual([{ id: 'good', name: 'Good', includes: ['A'], price: 12500 }])
    expect(written.discount).toEqual({ type: 'percent', value: 10 })
    expect(written.tax_rate).toBe(8.25)
    expect(written.deposit).toEqual({ type: 'percent', value: 50 })
    expect(written.expires_at).toBe('2026-09-01')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateProposal never passes a raw undefined to Firestore .update() — clears undefined fields via FieldValue.delete() instead', async () => {
    await updateProposal('org-1', 'p1', {
      line_items: [{ id: 'i1', description: 'DJ', quantity: 1, unit_price: 500 }],
      discount: undefined,
      tax_rate: undefined,
      deposit: undefined,
      expires_at: undefined,
    })
    const written = proposalDocUpdateSpy.mock.calls[0][0]
    // No own value in the update payload may be a raw `undefined` — Firestore Admin throws
    // "Cannot use \"undefined\" as a Firestore value" when ignoreUndefinedProperties is off.
    expect(Object.values(written).every((v) => v !== undefined)).toBe(true)
    // Fields explicitly cleared by the caller must be represented by the delete sentinel,
    // not silently dropped (dropping would leave a stale value in Firestore) and not raw undefined.
    const { FieldValue } = await import('firebase-admin/firestore')
    const deleteSentinel = FieldValue.delete()
    expect(written.discount).toEqual(deleteSentinel)
    expect(written.tax_rate).toEqual(deleteSentinel)
    expect(written.deposit).toEqual(deleteSentinel)
    expect(written.expires_at).toEqual(deleteSentinel)
  })

  it('createProposal includes packages when provided', async () => {
    await createProposal('org-1', 'lead-1', {
      packages: [{ id: 'good', name: 'Good', includes: [], price: 100 }],
    })
    const written = proposalDocSetSpy.mock.calls[0][0]
    expect(written.packages).toEqual([{ id: 'good', name: 'Good', includes: [], price: 100 }])
  })

  it('updateProposal passes through deposit_gate and deposit_terms', async () => {
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'sent' }) })
    await updateProposal('org-1', 'p1', { deposit_gate: 'before_accept', deposit_terms: 'Non-refundable.' })
    const written = proposalDocUpdateSpy.mock.calls[0][0]
    expect(written.deposit_gate).toBe('before_accept')
    expect(written.deposit_terms).toBe('Non-refundable.')
  })

  it('updateProposal refuses to edit a signed (locked) proposal and does not write', async () => {
    proposalDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'p1', status: 'accepted', signature: { signer_name: 'A', signed_at: 'x' } }),
    })
    await expect(updateProposal('org-1', 'p1', { title: 'edit' }))
      .rejects.toThrow('This proposal is signed and can no longer be edited')
    expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
  })

  // Fix 1: a before_accept proposal sits at status:'sent' with only a
  // `pending_signature` while its deposit payment is in flight. Editing or
  // deleting it mid-payment would let the webhook later find nothing to
  // promote — an orphaned, captured-but-unrecorded payment. Treat
  // `pending_signature` as locked, same as a full `signature`.
  describe('pending_signature locks the same as signature', () => {
    function pendingSignatureDoc() {
      return {
        exists: true,
        data: () => ({
          id: 'p1',
          status: 'sent',
          pending_signature: {
            signer_name: 'Dana',
            signer_email: 'd@x.co',
            captured_at: 'x',
            ip: '1.2.3.4',
            user_agent: 'ua',
            document_hash: 'a'.repeat(64),
            selection: { optional_item_ids: [], selected_total: 100, selected_at: 'x' },
          },
        }),
      }
    }

    it('updateProposal throws and writes nothing when pending_signature is present', async () => {
      proposalDocGetSpy.mockResolvedValue(pendingSignatureDoc())
      await expect(updateProposal('org-1', 'p1', { title: 'edit' }))
        .rejects.toThrow('This proposal is signed and can no longer be edited')
      expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
    })

    it('deleteProposal throws and writes nothing when pending_signature is present', async () => {
      proposalDocGetSpy.mockResolvedValue(pendingSignatureDoc())
      await expect(deleteProposal('org-1', 'p1'))
        .rejects.toThrow('This proposal is signed and can no longer be edited')
      expect(proposalDocDeleteSpy).not.toHaveBeenCalled()
    })

    it('sendProposal throws and writes nothing when pending_signature is present', async () => {
      proposalDocGetSpy.mockResolvedValue(pendingSignatureDoc())
      await expect(sendProposal('org-1', 'p1'))
        .rejects.toThrow('This proposal is signed and can no longer be edited')
      expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
    })

    it('deleteProposal still works normally when neither signature nor pending_signature is present', async () => {
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'sent' }) })
      await deleteProposal('org-1', 'p1')
      expect(proposalDocDeleteSpy).toHaveBeenCalled()
    })

    it('sendProposal still works normally when neither signature nor pending_signature is present', async () => {
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
      await sendProposal('org-1', 'p1')
      expect(proposalDocUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'sent', updated_at: expect.any(String) })
      )
    })
  })

  describe('voidProposal', () => {
    it('voidProposal sets voided + reason + voided_at on a sent proposal, without deleting', async () => {
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'accepted', signature: { signer_name: 'A' } }) })
      await voidProposal('org-1', 'p1', '  duplicate booking  ')
      const w = proposalDocUpdateSpy.mock.calls[0][0]
      expect(w.status).toBe('voided')
      expect(w.void_reason).toBe('duplicate booking')     // trimmed
      expect(w.voided_at).toEqual(expect.any(String))
      expect(proposalDocDeleteSpy).not.toHaveBeenCalled()
    })

    it('voidProposal requires a reason', async () => {
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'sent' }) })
      await expect(voidProposal('org-1', 'p1', '   ')).rejects.toThrow('A reason is required')
      expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
    })

    it('voidProposal refuses a draft and an already-voided proposal', async () => {
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
      await expect(voidProposal('org-1', 'p1', 'x')).rejects.toThrow('Only a sent proposal can be voided')
      proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'voided' }) })
      await expect(voidProposal('org-1', 'p1', 'x')).rejects.toThrow('already voided')
    })
  })
})
