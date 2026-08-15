import { describe, it, expect, vi, beforeEach } from 'vitest'

const listOrdersSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const markPickedUpSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const markRefundedSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderGetSpy = vi.hoisted(() => vi.fn())
const orgGetSpy = vi.hoisted(() => vi.fn())
const refundCreateSpy = vi.hoisted(() => vi.fn())
const assertOrgAdminSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'staff' }),
  assertOrgAdmin: assertOrgAdminSpy,
}))
vi.mock('@/lib/storefront/orders', () => ({
  listOrdersForDropCore: listOrdersSpy,
  markPickedUpCore: markPickedUpSpy,
  markRefundedCore: markRefundedSpy,
  ordersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orderGetSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orgGetSpy }) }) },
}))
vi.mock('@/lib/stripe', () => ({ stripe: { refunds: { create: refundCreateSpy } } }))

import { cancelOrder, markOrderPickedUp } from '@/actions/orders'

describe('cancelOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ stripe_account_id: 'acct_1' }) })
    orderGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'o1', status: 'confirmed', total: 11, payment: { intent_id: 'pi_1', paid_at: 'x' } }),
    })
    refundCreateSpy.mockResolvedValue({ id: 're_1', amount: 1100 })
  })

  it('refunds the full PI on the connected account and marks the order refunded', async () => {
    await cancelOrder('org-1', 'o1', { note: 'ran out' })
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('org-1')
    expect(refundCreateSpy).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { stripeAccount: 'acct_1' })
    expect(markRefundedSpy).toHaveBeenCalledWith('org-1', 'o1', expect.objectContaining({ refund_id: 're_1', amount: 11, note: 'ran out' }))
  })

  it('rejects orders without a payment and refunded orders', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'pending' }) })
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('paid')
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'refunded', payment: { intent_id: 'pi_1' } }) })
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('already')
    expect(refundCreateSpy).not.toHaveBeenCalled()
  })

  it('does not mark refunded when the Stripe refund fails', async () => {
    refundCreateSpy.mockRejectedValue(new Error('stripe down'))
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('stripe down')
    expect(markRefundedSpy).not.toHaveBeenCalled()
  })
})

describe('markOrderPickedUp', () => {
  it('delegates to the core', async () => {
    await markOrderPickedUp('org-1', 'o1')
    expect(markPickedUpSpy).toHaveBeenCalledWith('org-1', 'o1')
  })
})
