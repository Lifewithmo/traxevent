import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrgByHandleSpy = vi.hoisted(() => vi.fn())
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const createPendingSpy = vi.hoisted(() => vi.fn())
const deletePendingSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const piCreateSpy = vi.hoisted(() => vi.fn())
const checkRateLimitSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }))
const getHeadersSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ get: () => '1.2.3.4' }))

vi.mock('@/lib/public-profile-server', () => ({ getOrgByHandle: getOrgByHandleSpy }))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/storefront/orders', () => ({ createPendingOrderCore: createPendingSpy, deletePendingOrderCore: deletePendingSpy }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { create: piCreateSpy } } }))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { POST } from '@/app/api/payments/drop-order/intent/route'

const ORG = { id: 'org-1', name: 'Love Brew', stripe_account_id: 'acct_1', public_profile: { enabled: true, handle: 'lovebrew' } }
const DROP = { id: 'd1', status: 'scheduled', opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z', items: [], pickup: { location_name: 'x', windows: [] }, channels: [], timezone: 'UTC', title: 'Drop', created_at: 'x' }
const ORDER = { id: 'o1', token: 'T'.repeat(48), total: 18.43, org_id: 'org-1' }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/payments/drop-order/intent', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const BODY = {
  handle: 'lovebrew', drop_id: 'd1',
  cart: [{ product_id: 'p1', qty: 2 }],
  buyer: { name: 'Jane', email: 'jane@example.com' },
  pickup_window_id: 'w1', tip: 2,
}

describe('POST /api/payments/drop-order/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimitSpy.mockResolvedValue({ allowed: true })
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(DROP)
    createPendingSpy.mockResolvedValue(ORDER)
    piCreateSpy.mockResolvedValue({ id: 'pi_1', client_secret: 'cs_1' })
  })

  it('creates the pending order then a PI on the connected account with NO application fee', async () => {
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clientSecret: 'cs_1', stripeAccountId: 'acct_1', orderToken: 'T'.repeat(48) })
    const [piArgs, piOpts] = piCreateSpy.mock.calls[0]
    expect(piArgs.amount).toBe(1843)
    expect(piArgs).not.toHaveProperty('application_fee_amount')
    expect(piArgs.metadata).toEqual({ purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' })
    expect(piOpts).toEqual({ stripeAccount: 'acct_1' })
  })

  it('404s unknown handles/drops; 400s when Stripe is not connected or the drop is not open', async () => {
    getOrgByHandleSpy.mockResolvedValue(null)
    expect((await POST(makeRequest(BODY))).status).toBe(404)
    getOrgByHandleSpy.mockResolvedValue({ ...ORG, stripe_account_id: undefined })
    expect((await POST(makeRequest(BODY))).status).toBe(400)
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(null)
    expect((await POST(makeRequest(BODY))).status).toBe(404)
  })

  it('maps checkout-validation errors (sold out, closed) to 400 with the message', async () => {
    createPendingSpy.mockRejectedValue(new Error('Sold out: Vanilla Latte'))
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Sold out: Vanilla Latte')
    expect(piCreateSpy).not.toHaveBeenCalled()
  })

  it('rate-limits checkout attempts', async () => {
    checkRateLimitSpy.mockResolvedValue({ allowed: false })
    expect((await POST(makeRequest(BODY))).status).toBe(429)
    expect(createPendingSpy).not.toHaveBeenCalled()
    expect(getOrgByHandleSpy).not.toHaveBeenCalled()
    expect(getDropCoreSpy).not.toHaveBeenCalled()
  })

  it('cleans up the pending hold when PI creation fails', async () => {
    piCreateSpy.mockRejectedValue(new Error('stripe down'))
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(502)
    expect(deletePendingSpy).toHaveBeenCalledWith('org-1', 'o1')
  })

  it('still returns 502 with the PI error when the cleanup delete itself fails', async () => {
    piCreateSpy.mockRejectedValue(new Error('stripe down'))
    deletePendingSpy.mockRejectedValueOnce(new Error('firestore down'))
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'stripe down' })
  })
})
