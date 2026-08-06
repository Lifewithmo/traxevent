import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'a1', role: 'admin', event_access: {} }),
}))
vi.mock('@/lib/ops/compliance', () => ({
  listComplianceDocsCore: vi.fn().mockResolvedValue([]),
  createComplianceDocCore: vi.fn().mockResolvedValue({}),
  updateComplianceDocCore: vi.fn().mockResolvedValue(undefined),
  deleteComplianceDocCore: vi.fn().mockResolvedValue(undefined),
}))

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { listComplianceDocs, createComplianceDoc, updateComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'

beforeEach(() => vi.clearAllMocks())

describe('compliance actions', () => {
  it('reads gate on org membership', async () => {
    await listComplianceDocs('o1')
    expect(assertOrgMember).toHaveBeenCalledWith('o1')
  })

  it('writes gate on org admin', async () => {
    await createComplianceDoc('o1', { name: 'Permit' })
    await updateComplianceDoc('o1', 'cd1', { notes: 'x' })
    await deleteComplianceDoc('o1', 'cd1')
    expect(assertOrgAdmin).toHaveBeenCalledTimes(3)
  })
})
