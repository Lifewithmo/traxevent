import { describe, it, expect, vi, beforeEach } from 'vitest'

const existing = vi.hoisted(() => ({
  docs: [] as Array<{ data: () => unknown }>,
  get empty() { return this.docs.length === 0 },
}))
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const query = vi.hoisted(() => ({ limit: vi.fn(() => ({ get: vi.fn(async () => existing) })) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), where: vi.fn(() => query) }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { findOrCreateCustomerCore, normalizeEmail } from '@/lib/crm/customers'

describe('normalizeEmail', () => {
  it('lowercases and trims', () => expect(normalizeEmail('  Dana@Riv.CO ')).toBe('dana@riv.co'))
  it('returns undefined for blank', () => expect(normalizeEmail('   ')).toBeUndefined())
})

describe('findOrCreateCustomerCore', () => {
  beforeEach(() => { vi.clearAllMocks(); existing.docs = [] })

  it('creates a customer with email_lower when none matches', async () => {
    const { customer, created } = await findOrCreateCustomerCore('o1', { name: 'Dana Kim', email: 'Dana@Riv.CO' })
    expect(created).toBe(true)
    expect(customer.email).toBe('Dana@Riv.CO')
    expect(customer.email_lower).toBe('dana@riv.co')
    expect(custDoc.set).toHaveBeenCalledOnce()
  })

  it('reuses an existing customer matched case-insensitively', async () => {
    existing.docs = [{ data: () => ({ id: 'c-existing', name: 'Dana Kim', email: 'dana@riv.co', email_lower: 'dana@riv.co', created_at: 'x' }) }]
    const { customer, created } = await findOrCreateCustomerCore('o1', { name: 'D. Kim', email: 'DANA@riv.co' })
    expect(created).toBe(false)
    expect(customer.id).toBe('c-existing')
    expect(collRef.where).toHaveBeenCalledWith('email_lower', '==', 'dana@riv.co')
    expect(custDoc.set).not.toHaveBeenCalled()
  })

  it('always creates when there is no email to dedup on', async () => {
    const { created } = await findOrCreateCustomerCore('o1', { name: 'Walk-in' })
    expect(created).toBe(true)
    expect(collRef.where).not.toHaveBeenCalled()
  })
})
