import { describe, it, expect, vi, beforeEach } from 'vitest'

const leadDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocGetSpy = vi.hoisted(() => vi.fn())
const leadDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listLeadsSpy = vi.hoisted(() => vi.fn())
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))
const findOrCreateCustomerCore = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ customer: { id: 'default-customer-id', name: 'x', created_at: 'x' }, created: true })
)
const getCustomerCore = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const leadsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-lead-id',
      set: leadDocSetSpy,
      get: leadDocGetSpy,
      update: leadDocUpdateSpy,
      delete: leadDocDeleteSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listLeadsSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'leads') return leadsCol
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

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore, getCustomerCore }))

import {
  listLeads,
  getLead,
  createLead,
  updateLead,
  setLeadStage,
  deleteLead,
} from '@/actions/leads'
import { logActivity } from '@/lib/activity'

describe('leads actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLead writes a lead with a generated id, default stage, and created_at', async () => {
    const lead = await createLead('org-1', { name: 'Acme Wedding' })
    expect(leadDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Wedding',
        stage: 'inquiry',
        created_at: expect.any(String),
      })
    )
    expect(lead.id).toBeTruthy()
    expect(lead.stage).toBe('inquiry')
    expect(lead.name).toBe('Acme Wedding')
  })

  it('createLead omits blank optionals (email/organization)', async () => {
    await createLead('org-1', { name: 'No Extras', email: '', organization: '   ' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('email')
    expect(written).not.toHaveProperty('organization')
  })

  it('links a customer on create, reusing one that matches by email', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(findOrCreateCustomerCore).mockResolvedValue({
      customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' },
      created: false,
    })
    const lead = await createLead('o1', { name: 'Dana Kim', email: 'dana@riv.co', organization: 'Riverside' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(findOrCreateCustomerCore).toHaveBeenCalledWith('o1', {
      name: 'Dana Kim', email: 'dana@riv.co', company: 'Riverside',
    })
    expect(lead.customer_id).toBe('c1')
  })

  it('still creates the lead when no email is supplied', async () => {
    vi.mocked(findOrCreateCustomerCore).mockResolvedValue({
      customer: { id: 'c2', name: 'Walk-in', created_at: 'x' },
      created: true,
    })
    const lead = await createLead('o1', { name: 'Walk-in' })
    expect(lead.customer_id).toBe('c2')
  })

  it('persists a title when one is supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', title: '  Riverside gala  ' })
    expect(lead.title).toBe('Riverside gala')
  })

  it('omits title entirely when blank', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', title: '   ' })
    expect('title' in lead).toBe(false)
  })

  it('createLead throws "Name is required" for blank name and does not write', async () => {
    await expect(createLead('org-1', { name: '   ' })).rejects.toThrow('Name is required')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('createLead throws "Invalid stage" for a bad stage and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      createLead('org-1', { name: 'Bad Stage', stage: 'nope' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('listLeads orders by created_at desc and returns mapped docs', async () => {
    listLeadsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: 'x' }) }],
    })
    const list = await listLeads('org-1')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A')
  })

  it('getLead returns null when the doc does not exist', async () => {
    leadDocGetSpy.mockResolvedValue({ exists: false })
    const lead = await getLead('org-1', 'missing')
    expect(lead).toBeNull()
  })

  it('getLead returns the lead data when it exists', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: 'x' }),
    })
    const lead = await getLead('org-1', 'l1')
    expect(lead).not.toBeNull()
    expect(lead?.name).toBe('A')
  })

  it('updateLead skips undefined, maps null to FieldValue.delete, and always sets updated_at', async () => {
    await updateLead('org-1', 'l1', {
      name: 'New',
      // email cleared via null → FieldValue.delete() at runtime
      email: null,
      phone: undefined,
    })
    const written = leadDocUpdateSpy.mock.calls[0][0]
    expect(written.name).toBe('New')
    expect(written.email).toBe(fieldValueDeleteSentinel)
    expect(written).not.toHaveProperty('phone')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateLead throws "Invalid stage" for a bad stage and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      updateLead('org-1', 'l1', { stage: 'nope' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('updateLead logs a stage ActivityEvent when the stage actually changes', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'X', stage: 'inquiry', created_at: '' }),
    })
    await updateLead('org-1', 'l1', { stage: 'proposal' })
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        parent_type: 'opportunity',
        parent_id: 'l1',
        kind: 'stage',
        summary: 'Stage → proposal',
      })
    )
  })

  it('updateLead does not log when the stage is unchanged', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'X', stage: 'inquiry', created_at: '' }),
    })
    await updateLead('org-1', 'l1', { stage: 'inquiry' })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('updateLead does not log for a non-stage update', async () => {
    await updateLead('org-1', 'l1', { notes: 'x' })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('setLeadStage throws "Invalid stage" for a bad stage and does not update', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      setLeadStage('org-1', 'l1', 'nope')
    ).rejects.toThrow('Invalid stage')
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('setLeadStage updates stage and updated_at for a valid stage', async () => {
    await setLeadStage('org-1', 'l1', 'closed_won')
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'closed_won', updated_at: expect.any(String) })
    )
  })

  it('deleteLead calls .delete()', async () => {
    await deleteLead('org-1', 'l1')
    expect(leadDocDeleteSpy).toHaveBeenCalled()
  })
})

describe('createLead linked mode (customer_id)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies the customer contact snapshot and skips find-or-create', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({
      id: 'c9', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', phone: '555-1234', created_at: 'x',
    })
    const lead = await createLead('o1', { customer_id: 'c9', title: 'Fall gala' })
    expect(getCustomerCore).toHaveBeenCalledWith('o1', 'c9')
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'c9', name: 'Dana Kim', email: 'dana@riv.co', phone: '555-1234', organization: 'Riverside', title: 'Fall gala',
    }))
    expect(lead.customer_id).toBe('c9')
  })

  it('omits contact fields the customer does not have', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({ id: 'c9', name: 'Walk-in', created_at: 'x' })
    await createLead('o1', { customer_id: 'c9' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('email')
    expect(written).not.toHaveProperty('phone')
    expect(written).not.toHaveProperty('organization')
  })

  it('a typed organization overrides the customer snapshot on the lead only', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({
      id: 'c9', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: 'x',
    })
    await createLead('o1', { customer_id: 'c9', organization: '  First Baptist Church  ' })
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'c9', organization: 'First Baptist Church',
    }))
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
  })

  it('an explicitly blank organization omits it instead of falling back to the snapshot', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({
      id: 'c9', name: 'Dana Kim', company: 'Riverside', created_at: 'x',
    })
    await createLead('o1', { customer_id: 'c9', organization: '' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('organization')
  })

  it('throws Customer not found for an unknown id and writes nothing', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue(null)
    await expect(createLead('o1', { customer_id: 'nope' })).rejects.toThrow('Customer not found')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('still requires a name when no customer_id is given', async () => {
    await expect(createLead('o1', {})).rejects.toThrow('Name is required')
  })
})
