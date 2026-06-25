import { describe, it, expect, vi, beforeEach } from 'vitest'

const deptDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const deptDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listDeptsSpy = vi.hoisted(() => vi.fn())
const campsWhereGetSpy = vi.hoisted(() => vi.fn())
const batchUpdateSpy = vi.hoisted(() => vi.fn())
const batchCommitSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => {
  const deptsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-dept-id',
      set: deptDocSetSpy,
      delete: deptDocDeleteSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listDeptsSpy }),
  }
  const campsCol = {
    where: vi.fn().mockReturnValue({ get: campsWhereGetSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'departments') return deptsCol
      if (sub === 'camps') return campsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      batch: vi.fn().mockReturnValue({ update: batchUpdateSpy, commit: batchCommitSpy }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from '@/actions/departments'

describe('departments actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createDepartment writes a department with a generated id and created_at', async () => {
    const d = await createDepartment('org-1', { name: 'High School', description: 'HS ministry' })
    expect(deptDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'High School', description: 'HS ministry', created_at: expect.any(String) })
    )
    expect(d.id).toBeTruthy()
    expect(d.name).toBe('High School')
  })

  it('createDepartment omits description when blank', async () => {
    await createDepartment('org-1', { name: 'Kids' })
    expect(deptDocSetSpy.mock.calls[0][0]).not.toHaveProperty('description')
  })

  it('listDepartments returns departments ordered', async () => {
    listDeptsSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'd1', name: 'A', created_at: 'x' }) }] })
    const list = await listDepartments('org-1')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A')
  })

  it('deleteDepartment unassigns its camps then deletes the department', async () => {
    campsWhereGetSpy.mockResolvedValue({
      docs: [
        { ref: { id: 'c1' } },
        { ref: { id: 'c2' } },
      ],
    })
    await deleteDepartment('org-1', 'd1')
    expect(batchUpdateSpy).toHaveBeenCalledTimes(2)
    expect(batchCommitSpy).toHaveBeenCalled()
    expect(deptDocDeleteSpy).toHaveBeenCalled()
  })
})
