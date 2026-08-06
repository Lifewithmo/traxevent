import { describe, it, expect, vi, beforeEach } from 'vitest'

const customersGetSpy = vi.hoisted(() => vi.fn())
const customerUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const customersRefSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/crm/customers', () => ({
  customersRef: (...a: unknown[]) => customersRefSpy(...a),
  normalizeEmail: (email?: string) => {
    const e = email?.trim().toLowerCase()
    return e ? e : undefined
  },
}))

customersRefSpy.mockImplementation(() => ({
  get: customersGetSpy,
  doc: vi.fn(() => ({ update: customerUpdateSpy })),
}))

import { backfillEmailLower } from '@/scripts/crm-backfill-email-lower'

function snap(customers: Array<Record<string, unknown>>) {
  return { docs: customers.map((c) => ({ data: () => c })) }
}

describe('backfillEmailLower', () => {
  beforeEach(() => vi.clearAllMocks())

  it('backfills email_lower for a customer missing it', async () => {
    customersGetSpy.mockResolvedValue(snap([{ id: 'c1', email: 'Dana@Riv.CO' }]))
    const s = await backfillEmailLower('o1')
    expect(customerUpdateSpy).toHaveBeenCalledWith({ email_lower: 'dana@riv.co' })
    expect(s).toEqual({ total: 1, updated: 1, skipped: 0 })
  })

  it('skips a customer that already has email_lower (idempotent)', async () => {
    customersGetSpy.mockResolvedValue(snap([{ id: 'c1', email: 'dana@riv.co', email_lower: 'dana@riv.co' }]))
    const s = await backfillEmailLower('o1')
    expect(customerUpdateSpy).not.toHaveBeenCalled()
    expect(s).toEqual({ total: 1, updated: 0, skipped: 1 })
  })

  it('skips a customer with no email', async () => {
    customersGetSpy.mockResolvedValue(snap([{ id: 'c1', name: 'Walk-in' }]))
    const s = await backfillEmailLower('o1')
    expect(customerUpdateSpy).not.toHaveBeenCalled()
    expect(s).toEqual({ total: 1, updated: 0, skipped: 1 })
  })

  it('dry-run reports changes but writes nothing', async () => {
    customersGetSpy.mockResolvedValue(snap([{ id: 'c1', email: 'Dana@Riv.CO' }]))
    const s = await backfillEmailLower('o1', { dryRun: true })
    expect(customerUpdateSpy).not.toHaveBeenCalled()
    expect(s).toEqual({ total: 1, updated: 1, skipped: 0 })
  })

  it('handles a mixed batch in one pass', async () => {
    customersGetSpy.mockResolvedValue(
      snap([
        { id: 'c1', email: 'Dana@Riv.CO' },
        { id: 'c2', email: 'sam@x.co', email_lower: 'sam@x.co' },
        { id: 'c3', name: 'Walk-in' },
      ])
    )
    const s = await backfillEmailLower('o1')
    expect(customerUpdateSpy).toHaveBeenCalledOnce()
    expect(customerUpdateSpy).toHaveBeenCalledWith({ email_lower: 'dana@riv.co' })
    expect(s).toEqual({ total: 3, updated: 1, skipped: 2 })
  })
})
