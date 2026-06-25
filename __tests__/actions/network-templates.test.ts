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
}))
const getTemplatesSpy = vi.hoisted(() => vi.fn())

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
      return {}
    }),
  },
}))

import {
  listNetworkFormTemplates,
  createNetworkFormTemplate,
  updateNetworkFormTemplate,
  deleteNetworkFormTemplate,
} from '@/actions/network-templates'
import { assertNetworkAdmin } from '@/lib/auth/assert'

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
