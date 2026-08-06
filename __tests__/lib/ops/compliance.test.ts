import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'cd-new', set: docSetSpy, update: docUpdateSpy, delete: docDeleteSpy })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createComplianceDocCore, updateComplianceDocCore, expiringDocs } from '@/lib/ops/compliance'
import type { ComplianceDoc } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

describe('createComplianceDocCore', () => {
  it('requires a name', async () => {
    await expect(createComplianceDocCore('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })

  it('writes only provided fields', async () => {
    const doc = await createComplianceDocCore('o1', { name: 'Health permit', expires_on: '2026-12-01' })
    expect(doc.id).toBe('cd-new')
    expect(docSetSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Health permit', expires_on: '2026-12-01' }))
    expect(docSetSpy.mock.calls[0][0]).not.toHaveProperty('notes')
    expect(docSetSpy.mock.calls[0][0]).not.toHaveProperty('link_url')
  })
})

describe('updateComplianceDocCore', () => {
  it('deletes fields set to null and skips undefined', async () => {
    await updateComplianceDocCore('o1', 'cd1', { expires_on: null, name: undefined, notes: 'renewed' })
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.notes).toBe('renewed')
    expect(payload).not.toHaveProperty('name')
    // null → FieldValue.delete() sentinel (not literal null, not dropped) —
    // same assertion idiom as __tests__/lib/ops/resources.test.ts
    expect(payload.expires_on).toBeDefined()
    expect(payload.expires_on).not.toBeNull()
  })
})

describe('expiringDocs', () => {
  const docs: ComplianceDoc[] = [
    { id: '1', name: 'Permit', expires_on: '2026-09-01', created_at: 'x' },
    { id: '2', name: 'Insurance', expires_on: '2027-01-01', created_at: 'x' },
    { id: '3', name: 'No expiry', created_at: 'x' },
  ]
  it('returns docs expiring on or before the date, ignoring no-expiry docs', () => {
    expect(expiringDocs(docs, '2026-09-10').map((d) => d.name)).toEqual(['Permit'])
    expect(expiringDocs(docs, '2027-06-01').map((d) => d.name)).toEqual(['Permit', 'Insurance'])
  })
})
