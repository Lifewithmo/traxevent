import { describe, it, expect, vi, beforeEach } from 'vitest'

const existing = vi.hoisted(() => ({
  docs: [] as Array<{ data: () => unknown }>,
  get empty() { return this.docs.length === 0 },
}))
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const queryGetSpy = vi.hoisted(() => vi.fn(async () => existing))
const query = vi.hoisted(() => ({ limit: vi.fn(() => ({ get: queryGetSpy })) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), where: vi.fn(() => query) }))
// Mirrors the real admin SDK: transaction.get(ref-or-query) delegates to that
// object's own get(); transaction.set(ref, data) is a separate write op, distinct
// from a bare doc.set(data). This lets tests prove the lookup+create ran through
// the transaction, not through the plain collection/doc API.
const txGetSpy = vi.hoisted(() => vi.fn((refOrQuery: { get: () => unknown }) => refOrQuery.get()))
const txSetSpy = vi.hoisted(() => vi.fn())
const runTransactionSpy = vi.hoisted(() =>
  vi.fn(async (cb: (tx: { get: typeof txGetSpy; set: typeof txSetSpy }) => unknown) =>
    cb({ get: txGetSpy, set: txSetSpy })
  )
)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ collection: () => collRef }) }),
    runTransaction: runTransactionSpy,
  },
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
    expect(txSetSpy).toHaveBeenCalledOnce()
    expect(custDoc.set).not.toHaveBeenCalled()
  })

  it('reuses an existing customer matched case-insensitively', async () => {
    existing.docs = [{ data: () => ({ id: 'c-existing', name: 'Dana Kim', email: 'dana@riv.co', email_lower: 'dana@riv.co', created_at: 'x' }) }]
    const { customer, created } = await findOrCreateCustomerCore('o1', { name: 'D. Kim', email: 'DANA@riv.co' })
    expect(created).toBe(false)
    expect(customer.id).toBe('c-existing')
    expect(collRef.where).toHaveBeenCalledWith('email_lower', '==', 'dana@riv.co')
    expect(txSetSpy).not.toHaveBeenCalled()
    expect(custDoc.set).not.toHaveBeenCalled()
  })

  it('always creates when there is no email to dedup on', async () => {
    const { created } = await findOrCreateCustomerCore('o1', { name: 'Walk-in' })
    expect(created).toBe(true)
    expect(collRef.where).not.toHaveBeenCalled()
    // No key means nothing to race on — skip the transaction entirely.
    expect(runTransactionSpy).not.toHaveBeenCalled()
    expect(custDoc.set).toHaveBeenCalledOnce()
  })

  it('runs the lookup and the create atomically inside a single transaction (dedup race guard)', async () => {
    await findOrCreateCustomerCore('o1', { name: 'Dana Kim', email: 'Dana@Riv.CO' })
    expect(runTransactionSpy).toHaveBeenCalledOnce()
    expect(txGetSpy).toHaveBeenCalledOnce()     // the read runs through transaction.get(query)...
    expect(queryGetSpy).toHaveBeenCalledOnce()  // ...which is the query's own get(), reached only via tx.get
    expect(txSetSpy).toHaveBeenCalledOnce()     // the write runs through transaction.set(ref, data)...
    expect(custDoc.set).not.toHaveBeenCalled()  // ...never through a bare, non-transactional doc.set()
  })
})
