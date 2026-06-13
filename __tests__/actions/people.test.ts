import { describe, it, expect, vi, beforeEach } from 'vitest'

const templateDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const personDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const getTemplatesSpy = vi.hoisted(() => vi.fn())
const getPeopleSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'permission_templates') {
                return {
                  doc: vi.fn().mockReturnValue(templateDocSpy),
                  orderBy: vi.fn().mockReturnValue({ get: getTemplatesSpy }),
                }
              }
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'event_people') {
                        return {
                          doc: vi.fn().mockReturnValue(personDocSpy),
                          orderBy: vi.fn().mockReturnValue({ get: getPeopleSpy }),
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

import {
  listPermissionTemplates,
  createPermissionTemplate,
  updatePermissionTemplate,
  deletePermissionTemplate,
  addEventPerson,
  updateEventPersonPermissions,
  removeEventPerson,
} from '@/actions/people'

describe('listPermissionTemplates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges built-in templates with custom org templates', async () => {
    getTemplatesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'custom-1', name: 'Kitchen Lead', pages: ['families'], created_at: '2026-01-01' }) },
      ],
    })
    const all = await listPermissionTemplates('org-1')
    expect(all).toHaveLength(5)
    expect(all.some((t) => t.id === 'builtin-cabin-leader')).toBe(true)
    expect(all.some((t) => t.id === 'custom-1')).toBe(true)
  })
})

describe('createPermissionTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a custom template with pages and is_built_in false', async () => {
    const t = await createPermissionTemplate('org-1', {
      name: 'Kitchen Lead',
      pages: ['families', 'itinerary'],
    })
    expect(templateDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Kitchen Lead',
        pages: ['families', 'itinerary'],
        is_built_in: false,
        created_at: expect.any(String),
      })
    )
    expect(t.name).toBe('Kitchen Lead')
    expect(t.is_built_in).toBe(false)
  })

  it('filters out invalid page names', async () => {
    await createPermissionTemplate('org-1', {
      name: 'Bad',
      pages: ['families', 'not-a-page', 'budget'] as never,
    })
    const stored = templateDocSpy.set.mock.calls[0][0]
    expect(stored.pages).toEqual(['families', 'budget'])
  })
})

describe('updatePermissionTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates name/pages and sets updated_at', async () => {
    await updatePermissionTemplate('org-1', 'custom-1', { name: 'Renamed', pages: ['reports'] })
    expect(templateDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed',
        pages: ['reports'],
        updated_at: expect.any(String),
      })
    )
  })

  it('rejects updating a built-in template', async () => {
    await expect(
      updatePermissionTemplate('org-1', 'builtin-cabin-leader', { name: 'Nope' })
    ).rejects.toThrow('Cannot modify a built-in template')
    expect(templateDocSpy.update).not.toHaveBeenCalled()
  })
})

describe('deletePermissionTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a custom template', async () => {
    await deletePermissionTemplate('org-1', 'custom-1')
    expect(templateDocSpy.delete).toHaveBeenCalled()
  })

  it('rejects deleting a built-in template', async () => {
    await expect(deletePermissionTemplate('org-1', 'builtin-finance-admin')).rejects.toThrow(
      'Cannot delete a built-in template'
    )
    expect(templateDocSpy.delete).not.toHaveBeenCalled()
  })
})

describe('addEventPerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a volunteer with role and permission pages', async () => {
    const person = await addEventPerson('org-1', 'camp-1', {
      kind: 'volunteer',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'Cabin Leader',
      pages: ['families', 'assignments'],
    })
    expect(personDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'volunteer',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'Cabin Leader',
        pages: ['families', 'assignments'],
        created_at: expect.any(String),
      })
    )
    expect(person.kind).toBe('volunteer')
  })

  it('filters invalid pages on add', async () => {
    await addEventPerson('org-1', 'camp-1', {
      kind: 'staff',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'Director',
      pages: ['families', 'bogus'] as never,
    })
    const stored = personDocSpy.set.mock.calls[0][0]
    expect(stored.pages).toEqual(['families'])
  })
})

describe('updateEventPersonPermissions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates pages, applied_template_id, and updated_at', async () => {
    await updateEventPersonPermissions('org-1', 'camp-1', 'person-1', ['families', 'forms'], 'builtin-cabin-leader')
    expect(personDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: ['families', 'forms'],
        applied_template_id: 'builtin-cabin-leader',
        updated_at: expect.any(String),
      })
    )
  })

  it('clears applied_template_id to null when not provided (custom toggle)', async () => {
    await updateEventPersonPermissions('org-1', 'camp-1', 'person-1', ['families'])
    expect(personDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: ['families'],
        applied_template_id: null,
      })
    )
  })
})

describe('removeEventPerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the person document', async () => {
    await removeEventPerson('org-1', 'camp-1', 'person-1')
    expect(personDocSpy.delete).toHaveBeenCalled()
  })
})
