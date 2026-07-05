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
} from '@/actions/proposals'

describe('proposals actions', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
