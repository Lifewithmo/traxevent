import { describe, it, expect, vi, beforeEach } from 'vitest'

const typeDocSpy = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) }))
const getTypesSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue(typeDocSpy),
          orderBy: vi.fn().mockReturnValue({ get: getTypesSpy }),
        }),
      }),
    }),
  },
}))

import { listOrgEventTypes, createCustomEventType, deleteCustomEventType } from '@/actions/event-types'

const term = {
  registrantSingular: 'Athlete', registrantPlural: 'Athletes',
  memberSingular: 'Player', memberPlural: 'Players',
  assignmentSingular: 'Squad', assignmentPlural: 'Squads', eventLabel: 'Clinic',
}

describe('listOrgEventTypes', () => {
  beforeEach(() => vi.clearAllMocks())
  it('merges built-in event types with custom org types', async () => {
    getTypesSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'custom-1', name: 'Sports Clinic', description: 'd', registrationUnit: 'individual', terminology: term, is_custom: true }) }],
    })
    const all = await listOrgEventTypes('org-1')
    expect(all.some((t) => t.id === 'summer-camp')).toBe(true)
    expect(all.some((t) => t.id === 'custom-1' && t.is_custom)).toBe(true)
  })
})

describe('createCustomEventType', () => {
  beforeEach(() => vi.clearAllMocks())
  it('creates a custom type with is_custom true and a generated id', async () => {
    const t = await createCustomEventType('org-1', {
      name: 'Sports Clinic', description: 'Weekend clinic', registrationUnit: 'individual', terminology: term,
    })
    expect(typeDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sports Clinic', registrationUnit: 'individual', terminology: term, is_custom: true })
    )
    expect(t.is_custom).toBe(true)
    expect(t.id).toBeTruthy()
  })
})

describe('deleteCustomEventType', () => {
  beforeEach(() => vi.clearAllMocks())
  it('deletes a custom type', async () => {
    await deleteCustomEventType('org-1', 'custom-1')
    expect(typeDocSpy.delete).toHaveBeenCalled()
  })
  it('rejects deleting a built-in id', async () => {
    await expect(deleteCustomEventType('org-1', 'summer-camp')).rejects.toThrow('Cannot delete a built-in event type')
    expect(typeDocSpy.delete).not.toHaveBeenCalled()
  })
})
