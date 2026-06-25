import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertNetworkAdmin: vi.fn().mockResolvedValue({ uid: 'u', role: 'admin', display_name: '', email: '' }),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: vi.fn(() => '__inc__') },
}))

const templateDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
}))
const getTemplatesSpy = vi.hoisted(() => vi.fn())

// Per-org form_templates collection mock. The action accesses it as:
//   adminDb.collection('orgs').doc(orgId).collection('form_templates')
//     .where(...).limit(1).get()        → existing-copy lookup
//     .doc(localId).set(...)            → new copy
//     .doc(existingId).update(...)      → re-push
// Each registry entry IS the collection object the action receives (.where/.doc),
// with the inner spies (whereGet/docSet/docUpdate/docFns) attached for assertions.
const orgTemplatesByOrg = vi.hoisted(() => ({}) as Record<string, {
  where: ReturnType<typeof vi.fn>
  doc: ReturnType<typeof vi.fn>
  whereGet: ReturnType<typeof vi.fn>
  docSet: ReturnType<typeof vi.fn>
  docUpdate: ReturnType<typeof vi.fn>
  docFns: ReturnType<typeof vi.fn>
}>)
const makeOrgTemplates = vi.hoisted(() => (orgId: string) => {
  const docSet = vi.fn().mockResolvedValue(undefined)
  const docUpdate = vi.fn().mockResolvedValue(undefined)
  const whereGet = vi.fn()
  const docFns = vi.fn().mockReturnValue({ set: docSet, update: docUpdate })
  const collection = {
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ get: whereGet }),
    }),
    doc: docFns,
    whereGet,
    docSet,
    docUpdate,
    docFns,
  }
  orgTemplatesByOrg[orgId] = collection
  return collection
})

vi.mock('@/actions/networks', () => ({
  listNetworkOrgs: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'networks') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'form_templates') {
                return {
                  doc: vi.fn().mockReturnValue(templateDocSpy),
                  orderBy: vi.fn().mockReturnValue({ get: getTemplatesSpy }),
                }
              }
              return {}
            }),
          }),
        }
      }
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockImplementation((orgId: string) => ({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'form_templates') {
                return orgTemplatesByOrg[orgId] ?? makeOrgTemplates(orgId)
              }
              return {}
            }),
          })),
        }
      }
      return {}
    }),
  },
}))

import {
  listNetworkFormTemplates,
  createNetworkFormTemplate,
  updateNetworkFormTemplate,
  deleteNetworkFormTemplate,
  pushFormTemplateToNetworkOrgs,
} from '@/actions/network-templates'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import { listNetworkOrgs } from '@/actions/networks'

const baseField = {
  id: 'field-1',
  type: 'text' as const,
  label: 'Full name',
  required: true,
}

describe('listNetworkFormTemplates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('orders by created_at desc and returns docs', async () => {
    getTemplatesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 't1', name: 'Waiver' }) },
        { data: () => ({ id: 't2', name: 'Medical' }) },
      ],
    })
    const result = await listNetworkFormTemplates('net-1')
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(result).toEqual([
      { id: 't1', name: 'Waiver' },
      { id: 't2', name: 'Medical' },
    ])
  })
})

describe('createNetworkFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a template with version 1', async () => {
    const template = await createNetworkFormTemplate('net-1', {
      name: 'Waiver',
      formType: 'liability_waiver',
      audience: 'registrant',
      fields: [],
    })
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(templateDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Waiver',
        form_type: 'liability_waiver',
        audience: 'registrant',
        fields: [],
        version: 1,
        created_at: expect.any(String),
        id: expect.any(String),
      })
    )
    expect(template.name).toBe('Waiver')
    expect(template.version).toBe(1)
  })

  it('creates a template with fields', async () => {
    await createNetworkFormTemplate('net-1', {
      name: 'Waiver',
      formType: 'liability_waiver',
      audience: 'registrant',
      fields: [baseField],
    })
    expect(templateDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ fields: [baseField] })
    )
  })
})

describe('updateNetworkFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates with version increment and updated_at', async () => {
    await updateNetworkFormTemplate('net-1', 't1', { name: 'X' })
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(templateDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'X',
        version: '__inc__',
        updated_at: expect.any(String),
      })
    )
  })
})

describe('deleteNetworkFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the template document', async () => {
    await deleteNetworkFormTemplate('net-1', 't1')
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(templateDocSpy.delete).toHaveBeenCalled()
  })
})

describe('pushFormTemplateToNetworkOrgs', () => {
  const networkTemplate = {
    id: 'nt-1',
    name: 'Network Waiver',
    form_type: 'liability_waiver',
    audience: 'registrant',
    fields: [baseField],
    version: 3,
    created_at: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(orgTemplatesByOrg)) delete orgTemplatesByOrg[k]
    makeOrgTemplates('o1')
    makeOrgTemplates('o2')
    ;(listNetworkOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o1', name: 'Org One' },
      { id: 'o2', name: 'Org Two' },
    ])
    templateDocSpy.get.mockResolvedValue({ exists: true, data: () => networkTemplate })
  })

  it('first push: sets a new copy in each member org with provenance + version 1', async () => {
    orgTemplatesByOrg.o1.whereGet.mockResolvedValue({ empty: true, docs: [] })
    orgTemplatesByOrg.o2.whereGet.mockResolvedValue({ empty: true, docs: [] })

    const result = await pushFormTemplateToNetworkOrgs('net-1', 'nt-1')

    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(result).toEqual({ pushed: 2 })
    expect(orgTemplatesByOrg.o1.docSet).toHaveBeenCalledTimes(1)
    expect(orgTemplatesByOrg.o2.docSet).toHaveBeenCalledTimes(1)
    expect(orgTemplatesByOrg.o1.docUpdate).not.toHaveBeenCalled()
    expect(orgTemplatesByOrg.o2.docUpdate).not.toHaveBeenCalled()

    expect(orgTemplatesByOrg.o1.docSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Network Waiver',
        form_type: 'liability_waiver',
        audience: 'registrant',
        fields: [baseField],
        version: 1,
        network_template_id: 'nt-1',
        network_id: 'net-1',
        pushed_at: expect.any(String),
      })
    )
  })

  it('re-push: updates the existing org copy instead of creating a duplicate', async () => {
    orgTemplatesByOrg.o1.whereGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'local-1' }],
    })
    orgTemplatesByOrg.o2.whereGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'local-2' }],
    })

    const result = await pushFormTemplateToNetworkOrgs('net-1', 'nt-1')

    expect(result).toEqual({ pushed: 2 })
    expect(orgTemplatesByOrg.o1.docFns).toHaveBeenCalledWith('local-1')
    expect(orgTemplatesByOrg.o2.docFns).toHaveBeenCalledWith('local-2')
    expect(orgTemplatesByOrg.o1.docUpdate).toHaveBeenCalledTimes(1)
    expect(orgTemplatesByOrg.o2.docUpdate).toHaveBeenCalledTimes(1)
    expect(orgTemplatesByOrg.o1.docSet).not.toHaveBeenCalled()
    expect(orgTemplatesByOrg.o2.docSet).not.toHaveBeenCalled()

    expect(orgTemplatesByOrg.o1.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Network Waiver',
        version: '__inc__',
        pushed_at: expect.any(String),
      })
    )
  })

  it('throws when the network template does not exist', async () => {
    templateDocSpy.get.mockResolvedValue({ exists: false })
    await expect(pushFormTemplateToNetworkOrgs('net-1', 'missing')).rejects.toThrow(
      'Template not found'
    )
  })
})
