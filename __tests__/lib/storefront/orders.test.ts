import { describe, it, expect, vi, beforeEach } from 'vitest'

const orderSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderGetSpy = vi.hoisted(() => vi.fn())
const orderUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropGetSpy = vi.hoisted(() => vi.fn())
const ordersQueryGetSpy = vi.hoisted(() => vi.fn())
const txSetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const ordersCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      kind: 'order', id: id ?? 'new-order-id',
      set: orderSetSpy, get: orderGetSpy, update: orderUpdateSpy,
    })),
    where: vi.fn().mockReturnValue({ get: ordersQueryGetSpy, kind: 'orders-query' }),
  }
  const dropsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({ kind: 'drop', id, get: dropGetSpy })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'orders' ? ordersCol : sub === 'drops' ? dropsCol : {})),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      runTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          get: (ref: { kind?: string; get?: () => unknown }) => {
            if (ref.kind === 'orders-query') return ordersQueryGetSpy()
            if (ref.kind === 'drop') return dropGetSpy()
            return orderGetSpy()
          },
          set: txSetSpy,
        })
      ),
    },
  }
})

import { createPendingOrderCore, confirmOrderCore, markPickedUpCore, markRefundedCore } from '@/lib/storefront/orders'
import type { Drop, Order } from '@/lib/types'

const DROP: Drop = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled',
  opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 2 }],
  channels: ['email'], created_at: 'x',
}

const CHECKOUT = {
  cart: [{ product_id: 'p1', qty: 1 }],
  buyer: { name: 'Jane', email: 'jane@example.com' },
  pickup_window_id: 'w1',
}

describe('createPendingOrderCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ordersQueryGetSpy.mockResolvedValue({ docs: [] })
  })

  it('writes a pending order with server-computed totals, hold expiry, and a 48-char token', async () => {
    const order = await createPendingOrderCore('org-1', DROP, CHECKOUT)
    expect(order.status).toBe('pending')
    expect(order.total).toBe(5.5)
    expect(order.org_id).toBe('org-1')
    expect(order.channel).toBe('drop')
    expect(order.token).toHaveLength(48)
    expect(Date.parse(order.expires_at!)).toBeGreaterThan(Date.now())
    expect(txSetSpy).toHaveBeenCalled()
  })

  it('rejects when stock is exhausted by confirmed orders, naming the item', async () => {
    ordersQueryGetSpy.mockResolvedValue({
      docs: [{ data: () => ({ status: 'confirmed', lines: [{ product_id: 'p1', qty: 2 }] }) }],
    })
    await expect(createPendingOrderCore('org-1', DROP, CHECKOUT)).rejects.toThrow('Vanilla Latte')
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('rejects closed drops, unknown windows, missing slot when window is slotted, bad buyers', async () => {
    await expect(createPendingOrderCore('org-1', { ...DROP, status: 'closed' }, CHECKOUT)).rejects.toThrow('not open')
    await expect(createPendingOrderCore('org-1', DROP, { ...CHECKOUT, pickup_window_id: 'nope' })).rejects.toThrow('pickup window')
    const slotted: Drop = { ...DROP, pickup: { ...DROP.pickup, windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00', slot_minutes: 15 }] } }
    await expect(createPendingOrderCore('org-1', slotted, CHECKOUT)).rejects.toThrow('pickup time')
    await expect(createPendingOrderCore('org-1', slotted, { ...CHECKOUT, pickup_slot: '12:00' })).rejects.toThrow('pickup time')
    await expect(createPendingOrderCore('org-1', DROP, { ...CHECKOUT, buyer: { name: 'J', email: 'not-an-email' } })).rejects.toThrow('email')
  })
})

describe('confirmOrderCore', () => {
  beforeEach(() => vi.clearAllMocks())
  const PAY = { intent_id: 'pi_1', paid_at: '2026-08-20T16:00:00.000Z' }

  it('assigns the next per-drop number transactionally and confirms', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'pending' }) })
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', order_seq: 7 }) })
    const { order, confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(true)
    expect(order.number).toBe(8)
    expect(order.status).toBe('confirmed')
    // both the drop counter and the order are written in the same transaction
    expect(txSetSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'drop' }), expect.objectContaining({ order_seq: 8 }), { merge: true })
    expect(txSetSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'order' }), expect.objectContaining({ status: 'confirmed', number: 8, payment: PAY }), { merge: true })
  })

  it('is idempotent: already-confirmed orders return confirmedNow:false with no writes', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'confirmed', number: 8 }) })
    const { confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(false)
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('refunded orders are not resurrected by a late success webhook', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'refunded' }) })
    const { confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(false)
    expect(txSetSpy).not.toHaveBeenCalled()
  })
})

describe('status transitions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('markPickedUpCore requires confirmed; markRefundedCore is idempotent', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'confirmed' }) })
    await markPickedUpCore('org-1', 'o1')
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'picked_up' }))

    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'pending' }) })
    await expect(markPickedUpCore('org-1', 'o1')).rejects.toThrow('confirmed')

    const REFUND = { refund_id: 're_1', amount: 5.5, refunded_at: 'x' }
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'refunded', refund: REFUND }) })
    orderUpdateSpy.mockClear()
    await markRefundedCore('org-1', 'o1', REFUND)
    expect(orderUpdateSpy).not.toHaveBeenCalled()
  })
})
