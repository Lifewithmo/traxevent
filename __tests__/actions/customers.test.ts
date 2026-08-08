import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), orderBy: vi.fn(() => ({ get: vi.fn() })) }))
const listLeadsByCustomerCore = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({}), assertOrgAdmin: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsByCustomerCore }))
import { createCustomer, updateCustomer, listCustomerOpportunities } from '@/actions/customers'

describe('createCustomer', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires a name', async () => {
    await expect(createCustomer('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })
  it('creates a customer with an id and timestamp', async () => {
    const c = await createCustomer('o1', { name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    expect(c.name).toBe('Dana Kim')
    expect(c.id).toBeTruthy()
    expect(c.created_at).toBeTruthy()
    expect(custDoc.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' }))
  })
})

describe('updateCustomer email_lower sync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets email_lower alongside a new email value', async () => {
    await updateCustomer('o1', 'c1', { email: 'Dana@Riv.CO' })
    expect(custDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Dana@Riv.CO', email_lower: 'dana@riv.co' })
    )
  })

  it('deletes email_lower when email is explicitly cleared', async () => {
    await updateCustomer('o1', 'c1', { email: null })
    const written = custDoc.update.mock.calls[0][0]
    expect(written.email).toBeInstanceOf(Object) // FieldValue.delete() sentinel
    expect('email_lower' in written).toBe(true)
    expect(written.email_lower).toBeInstanceOf(Object) // also a delete sentinel
  })

  it('leaves email_lower untouched when email is not part of the update', async () => {
    await updateCustomer('o1', 'c1', { name: 'New Name' })
    const written = custDoc.update.mock.calls[0][0]
    expect('email' in written).toBe(false)
    expect('email_lower' in written).toBe(false)
  })
})

describe('listCustomerOpportunities', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires org membership', async () => {
    const { assertOrgMember } = await import('@/lib/auth/assert')
    listLeadsByCustomerCore.mockResolvedValue([])
    await listCustomerOpportunities('o1', 'c1')
    expect(assertOrgMember).toHaveBeenCalledWith('o1')
    expect(listLeadsByCustomerCore).toHaveBeenCalledWith('o1', 'c1')
  })
})

describe('updateCustomer tag normalization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes tags before writing', async () => {
    await updateCustomer('o1', 'c1', { tags: ['  VIP ', 'vip', '', 'repeat'] })
    expect(custDoc.update).toHaveBeenCalledWith(expect.objectContaining({ tags: ['VIP', 'repeat'] }))
  })

  it('clears tags with a delete sentinel on null', async () => {
    await updateCustomer('o1', 'c1', { tags: null })
    const written = custDoc.update.mock.calls[0][0]
    expect(written.tags).toBeInstanceOf(Object) // FieldValue.delete() sentinel
  })
})
