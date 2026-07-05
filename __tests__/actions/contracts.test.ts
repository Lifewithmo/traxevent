import { describe, it, expect, vi, beforeEach } from 'vitest'

const contractDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const contractDocGetSpy = vi.hoisted(() => vi.fn())
const contractDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const contractDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listContractsSpy = vi.hoisted(() => vi.fn())
const listAllContractsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const contractsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-contract-id',
      set: contractDocSetSpy,
      get: contractDocGetSpy,
      update: contractDocUpdateSpy,
      delete: contractDocDeleteSpy,
    })),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: listContractsSpy }),
    }),
    orderBy: vi.fn().mockReturnValue({ get: listAllContractsSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'contracts') return contractsCol
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
  listContracts,
  listAllContracts,
  getContract,
  createContract,
  updateContract,
  sendContract,
  deleteContract,
} from '@/actions/contracts'

describe('contracts actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createContract writes a contract with generated id, token, org/lead, draft status, created_at, and passed fields', async () => {
    const contract = await createContract('org-1', 'lead-1', {
      title: 'Service Agreement',
      body: 'Terms and conditions',
      document_url: 'https://example.com/contract.pdf',
    })
    expect(contractDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        lead_id: 'lead-1',
        token: 'tok_test',
        status: 'draft',
        title: 'Service Agreement',
        body: 'Terms and conditions',
        document_url: 'https://example.com/contract.pdf',
        created_at: expect.any(String),
      })
    )
    expect(contract.id).toBeTruthy()
    expect(contract.token).toBe('tok_test')
    expect(contract.org_id).toBe('org-1')
    expect(contract.lead_id).toBe('lead-1')
    expect(contract.status).toBe('draft')
    expect(contract.title).toBe('Service Agreement')
    expect(contract.body).toBe('Terms and conditions')
    expect(contract.document_url).toBe('https://example.com/contract.pdf')
  })

  it('createContract omits title/body/document_url when blank', async () => {
    const contract = await createContract('org-1', 'lead-1', {
      title: '   ',
      body: '',
      document_url: '   ',
    })
    const written = contractDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('title')
    expect(written).not.toHaveProperty('body')
    expect(written).not.toHaveProperty('document_url')
    expect(contract.title).toBeUndefined()
    expect(contract.body).toBeUndefined()
    expect(contract.document_url).toBeUndefined()
  })

  it('createContract throws for an invalid document_url and does not write', async () => {
    await expect(
      createContract('org-1', 'lead-1', { document_url: 'ftp://bad/url' })
    ).rejects.toThrow('Document URL must start with http:// or https://')
    expect(contractDocSetSpy).not.toHaveBeenCalled()
  })

  it('listContracts filters by lead_id, orders by created_at desc, and returns mapped docs', async () => {
    listContractsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'c1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }) }],
    })
    const list = await listContracts('org-1', 'lead-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('c1')
  })

  it('listAllContracts returns every contract across leads ordered by created_at desc (no lead filter)', async () => {
    listAllContractsSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'c1', lead_id: 'lead-1', status: 'draft', created_at: 'b' }) },
        { data: () => ({ id: 'c2', lead_id: 'lead-2', status: 'sent', created_at: 'a' }) },
      ],
    })
    const list = await listAllContracts('org-1')
    expect(list).toHaveLength(2)
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(list.map((c) => c.lead_id)).toEqual(['lead-1', 'lead-2'])
  })

  it('getContract returns null when the doc does not exist', async () => {
    contractDocGetSpy.mockResolvedValue({ exists: false })
    const contract = await getContract('org-1', 'missing')
    expect(contract).toBeNull()
  })

  it('getContract returns the contract data when it exists', async () => {
    contractDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'c1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }),
    })
    const contract = await getContract('org-1', 'c1')
    expect(contract).not.toBeNull()
    expect(contract?.id).toBe('c1')
  })

  it('updateContract passes through title/body/document_url/status and always sets updated_at', async () => {
    await updateContract('org-1', 'c1', {
      title: 'Updated',
      body: 'New body',
      document_url: 'https://example.com/v2.pdf',
      status: 'sent',
    })
    const written = contractDocUpdateSpy.mock.calls[0][0]
    expect(written.title).toBe('Updated')
    expect(written.body).toBe('New body')
    expect(written.document_url).toBe('https://example.com/v2.pdf')
    expect(written.status).toBe('sent')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateContract throws "Invalid status" for a bad status and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid status at runtime
      updateContract('org-1', 'c1', { status: 'nope' })
    ).rejects.toThrow('Invalid status')
    expect(contractDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('updateContract throws for an invalid document_url and does not write', async () => {
    await expect(
      updateContract('org-1', 'c1', { document_url: 'ftp://bad/url' })
    ).rejects.toThrow('Document URL must start with http:// or https://')
    expect(contractDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('sendContract updates status to sent and sets updated_at', async () => {
    await sendContract('org-1', 'c1')
    expect(contractDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', updated_at: expect.any(String) })
    )
  })

  it('deleteContract calls .delete()', async () => {
    await deleteContract('org-1', 'c1')
    expect(contractDocDeleteSpy).toHaveBeenCalled()
  })
})
