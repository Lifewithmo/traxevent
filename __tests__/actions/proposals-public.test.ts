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
  // A full Firestore doc as it exists at rest, including the secret/internal
  // fields that must NEVER reach a public caller.
  function fullDoc(status: string) {
    return {
      id: 'p1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      title: 'Wedding Package',
      status,
      line_items: [{ description: 'Venue', quantity: 1, unit_price: 5000 }],
      notes: 'Deposit due on signing',
      client_response_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    }
  }

  it('returns null for an unknown token (empty snapshot)', async () => {
    mockSnapshot(null)
    expect(await getPublicProposal('nope')).toBeNull()
  })

  it('returns null for a draft proposal (drafts are never exposed)', async () => {
    mockSnapshot(fullDoc('draft'))
    expect(await getPublicProposal('tok')).toBeNull()
  })

  it('projects only public-safe fields for a sent proposal', async () => {
    const doc = fullDoc('sent')
    mockSnapshot(doc)
    expect(await getPublicProposal('tok')).toEqual({
      title: 'Wedding Package',
      status: 'sent',
      line_items: [{ description: 'Venue', quantity: 1, unit_price: 5000 }],
      notes: 'Deposit due on signing',
      client_response_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
    })
  })

  it('projects only public-safe fields for an accepted proposal', async () => {
    mockSnapshot(fullDoc('accepted'))
    const result = await getPublicProposal('tok')
    expect(result?.status).toBe('accepted')
    expect(result?.title).toBe('Wedding Package')
  })

  it('projects only public-safe fields for a rejected proposal', async () => {
    mockSnapshot(fullDoc('rejected'))
    const result = await getPublicProposal('tok')
    expect(result?.status).toBe('rejected')
  })

  it('never leaks the secret token or internal ids in the DTO', async () => {
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicProposal('tok')
    expect(result).not.toBeNull()
    // These fields are seeded on the mocked doc; the DTO must strip them.
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('lead_id' in (result as object)).toBe(false)
    expect('id' in (result as object)).toBe(false)
    // No stray internal fields either.
    expect('updated_at' in (result as object)).toBe(false)
    expect(Object.keys(result as object).sort()).toEqual(
      ['client_response_at', 'created_at', 'line_items', 'notes', 'status', 'title'].sort(),
    )
  })

  it('omits optional fields that are absent on the doc', async () => {
    // Minimal doc: no title/notes/client_response_at, but still carries
    // secret fields that must be stripped.
    mockSnapshot({
      id: 'p1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      status: 'sent',
      line_items: [],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await getPublicProposal('tok')
    expect(result).toEqual({
      status: 'sent',
      line_items: [],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
  })
})

describe('respondToProposal', () => {
  it('accepts a sent proposal and advances the lead to closed_won', async () => {
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
      expect.objectContaining({ stage: 'closed_won' }),
    )
  })

  // M-4: cross-tenant isolation. The org/lead advanced on accept must be
  // resolved from the found doc's own path (doc.ref.parent.parent) and its
  // stored lead_id — never from any caller-supplied identifier.
  it('advances the lead via the org from the doc path and the doc lead_id (isolation)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-from-doc', status: 'sent' })
    await respondToProposal('tok', 'accepted')

    // orgRef.collection('leads').doc(...) was called with the lead_id from
    // the found doc's data, proving the lead is scoped to the doc's own org.
    expect(leadDocSpy).toHaveBeenCalledTimes(1)
    expect(leadDocSpy).toHaveBeenCalledWith('lead-from-doc')
    expect(leadUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'closed_won' }),
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
