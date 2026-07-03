import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSpy, proposalUpdateSpy, leadUpdateSpy, leadDocSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  proposalUpdateSpy: vi.fn().mockResolvedValue(undefined),
  leadUpdateSpy: vi.fn().mockResolvedValue(undefined),
  leadDocSpy: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: getSpy,
  },
}))

import { getPublicProposal, respondToProposal } from '@/actions/proposals-public'

// Builds a snapshot whose single doc carries `data` and a `ref` whose
// parent.parent is the org, so a lead advance resolves to
// orgs/org-1/leads/{lead_id} — the org/lead come only from the doc path.
function mockSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    getSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  leadDocSpy.mockReturnValue({ update: leadUpdateSpy })
  const orgRef = {
    id: 'org-1',
    collection: vi.fn().mockReturnValue({ doc: leadDocSpy }),
  }
  const ref = {
    update: proposalUpdateSpy,
    parent: { parent: orgRef },
  }
  getSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data, ref }],
  })
}

beforeEach(() => {
  getSpy.mockReset()
  proposalUpdateSpy.mockClear()
  leadUpdateSpy.mockClear()
  leadDocSpy.mockClear()
})

describe('getPublicProposal', () => {
  it('returns null for an unknown token (empty snapshot)', async () => {
    mockSnapshot(null)
    expect(await getPublicProposal('nope')).toBeNull()
  })

  it('returns null for a draft proposal (drafts are never exposed)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'draft' })
    expect(await getPublicProposal('tok')).toBeNull()
  })

  it('returns the proposal for a sent proposal', async () => {
    const p = { id: 'p1', lead_id: 'lead-1', status: 'sent' }
    mockSnapshot(p)
    expect(await getPublicProposal('tok')).toEqual(p)
  })

  it('returns the proposal for an accepted proposal', async () => {
    const p = { id: 'p1', lead_id: 'lead-1', status: 'accepted' }
    mockSnapshot(p)
    expect(await getPublicProposal('tok')).toEqual(p)
  })

  it('returns the proposal for a rejected proposal', async () => {
    const p = { id: 'p1', lead_id: 'lead-1', status: 'rejected' }
    mockSnapshot(p)
    expect(await getPublicProposal('tok')).toEqual(p)
  })
})

describe('respondToProposal', () => {
  it('accepts a sent proposal and advances the lead to booked', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'accepted')

    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    expect(proposalUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted' }),
    )
    const proposalArg = proposalUpdateSpy.mock.calls[0][0]
    expect(proposalArg.client_response_at).toBeTruthy()
    expect(proposalArg.updated_at).toBeTruthy()

    expect(leadDocSpy).toHaveBeenCalledWith('lead-1')
    expect(leadUpdateSpy).toHaveBeenCalledTimes(1)
    expect(leadUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'booked' }),
    )
  })

  it('rejects a sent proposal without advancing the lead', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'rejected')

    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    expect(proposalUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    )
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws and writes nothing for an already-accepted proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'accepted' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'This proposal is no longer awaiting a response',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws and writes nothing for a draft proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'draft' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'This proposal is no longer awaiting a response',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for an unknown token', async () => {
    mockSnapshot(null)
    await expect(respondToProposal('nope', 'accepted')).rejects.toThrow(
      'Proposal not found',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for an invalid response value without any lookup or writes', async () => {
    await expect(
      // @ts-expect-error deliberately passing an invalid response value
      respondToProposal('tok', 'maybe'),
    ).rejects.toThrow('Invalid response')
    expect(getSpy).not.toHaveBeenCalled()
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })
})
