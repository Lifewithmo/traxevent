import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSpy, contractUpdateSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  contractUpdateSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: getSpy,
  },
}))

import { getPublicContract, signContract } from '@/actions/contracts-public'

// Builds a snapshot whose single doc carries `data` and a `ref` that exposes
// only `.update` — writes must target the found doc's own ref, never a
// caller-supplied identifier.
function mockSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    getSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  const ref = { update: contractUpdateSpy }
  getSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data, ref }],
  })
}

beforeEach(() => {
  getSpy.mockReset()
  contractUpdateSpy.mockClear()
})

describe('getPublicContract', () => {
  // A full Firestore doc as it exists at rest, including the secret/internal
  // fields that must NEVER reach a public caller.
  function fullDoc(status: string) {
    return {
      id: 'c1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      title: 'Venue Rental Agreement',
      body: 'These are the terms.',
      document_url: 'https://example.com/contract.pdf',
      status,
      signed_by: 'Jane Client',
      signed_at: '2026-06-10T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    }
  }

  it('returns null for an unknown token (empty snapshot)', async () => {
    mockSnapshot(null)
    expect(await getPublicContract('nope')).toBeNull()
  })

  it('returns null for a draft contract (drafts are never exposed)', async () => {
    mockSnapshot(fullDoc('draft'))
    expect(await getPublicContract('tok')).toBeNull()
  })

  it('projects only public-safe fields for a sent contract', async () => {
    mockSnapshot(fullDoc('sent'))
    expect(await getPublicContract('tok')).toEqual({
      title: 'Venue Rental Agreement',
      body: 'These are the terms.',
      document_url: 'https://example.com/contract.pdf',
      status: 'sent',
      signed_by: 'Jane Client',
      signed_at: '2026-06-10T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
    })
  })

  it('projects only public-safe fields for a signed contract', async () => {
    mockSnapshot(fullDoc('signed'))
    const result = await getPublicContract('tok')
    expect(result?.status).toBe('signed')
    expect(result?.signed_by).toBe('Jane Client')
    expect(result?.signed_at).toBe('2026-06-10T00:00:00.000Z')
  })

  it('never leaks the secret token or internal ids in the DTO', async () => {
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicContract('tok')
    expect(result).not.toBeNull()
    // These fields are seeded on the mocked doc; the DTO must strip them.
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('lead_id' in (result as object)).toBe(false)
    expect('id' in (result as object)).toBe(false)
    // No stray internal fields either.
    expect('updated_at' in (result as object)).toBe(false)
    expect(Object.keys(result as object).sort()).toEqual(
      ['body', 'created_at', 'document_url', 'signed_at', 'signed_by', 'status', 'title'].sort(),
    )
  })

  it('omits optional fields that are absent on the doc', async () => {
    // Minimal doc: no title/body/document_url/signed_*, but still carries
    // secret fields that must be stripped.
    mockSnapshot({
      id: 'c1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      status: 'sent',
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await getPublicContract('tok')
    expect(result).toEqual({
      status: 'sent',
      created_at: '2026-05-01T00:00:00.000Z',
    })
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('signed_by' in (result as object)).toBe(false)
  })
})

describe('signContract', () => {
  it('signs a sent contract, writing only the found doc ref', async () => {
    mockSnapshot({ id: 'c1', org_id: 'org-1', lead_id: 'lead-1', token: 'tok', status: 'sent' })
    await signContract('tok', '  Jane Client  ')

    expect(contractUpdateSpy).toHaveBeenCalledTimes(1)
    expect(contractUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'signed', signed_by: 'Jane Client' }),
    )
    const arg = contractUpdateSpy.mock.calls[0][0]
    expect(arg.signed_at).toBeTruthy()
    expect(arg.updated_at).toBeTruthy()
    // No caller-supplied identifiers are written.
    expect('id' in arg).toBe(false)
    expect('org_id' in arg).toBe(false)
    expect('lead_id' in arg).toBe(false)
    expect('token' in arg).toBe(false)
  })

  it('throws and writes nothing for a draft contract', async () => {
    mockSnapshot({ id: 'c1', status: 'draft' })
    await expect(signContract('tok', 'Jane')).rejects.toThrow(
      'This contract is no longer awaiting a signature',
    )
    expect(contractUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws and writes nothing for an already-signed contract', async () => {
    mockSnapshot({ id: 'c1', status: 'signed' })
    await expect(signContract('tok', 'Jane')).rejects.toThrow(
      'This contract is no longer awaiting a signature',
    )
    expect(contractUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for an unknown token', async () => {
    mockSnapshot(null)
    await expect(signContract('nope', 'Jane')).rejects.toThrow('Contract not found')
    expect(contractUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for a blank signer name without any lookup or writes', async () => {
    await expect(signContract('tok', '   ')).rejects.toThrow(
      'Please type your name to sign',
    )
    expect(getSpy).not.toHaveBeenCalled()
    expect(contractUpdateSpy).not.toHaveBeenCalled()
  })
})
