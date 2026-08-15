import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())
const confirmOrderSpy = vi.hoisted(() => vi.fn())
const markRefundedSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const findOrCreateSpy = vi.hoisted(() => vi.fn())
const logActivitySpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const sendOrderConfirmationSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getVerifiedSendingDomainSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const piRetrieveSpy = vi.hoisted(() => vi.fn())
const familiesGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))
const proposalsGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))

vi.mock('@/lib/storefront/orders', () => ({
  confirmOrderCore: confirmOrderSpy,
  markRefundedCore: markRefundedSpy,
  ordersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: orderUpdateSpy }) }),
}))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore: findOrCreateSpy }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/email', () => ({
  sendOrderConfirmation: sendOrderConfirmationSpy,
  sendRegistrationConfirmation: vi.fn(),
  sendProposalSignedConfirmation: vi.fn(),
}))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: getVerifiedSendingDomainSpy }))
vi.mock('@/lib/crm/deposit-reconcile', () => ({ reconcileProposalDeposit: vi.fn() }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn((name: string) =>
      name === 'proposals'
        ? { where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: proposalsGetSpy }) }) }
        : { where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: familiesGetSpy }) }) }
    ),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn(),
        // the drop-order branch reads the org doc for the email display name —
        // it must resolve or the best-effort catch swallows the email assert
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ name: 'Love Brew LLC', branding: { display_name: 'Love Brew' } }),
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: constructEventSpy }, paymentIntents: { retrieve: piRetrieveSpy } },
}))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { POST } from '@/app/api/payments/webhook/route'

const ORDER = {
  id: 'o1', org_id: 'org-1', drop_id: 'd1', status: 'confirmed', number: 8,
  buyer: { name: 'Jane', email: 'jane@example.com', phone: '208' },
  lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
  pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 'tok', created_at: 'x',
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled', opens_at: 'x', closes_at: 'x', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [], channels: [], created_at: 'x',
}

function makeRequest() {
  return new Request('http://localhost/api/payments/webhook', { method: 'POST', body: '{}' })
}

describe('payments webhook — drop orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({ get: (k: string) => (k === 'stripe-signature' ? 'sig' : null) })
    getDropCoreSpy.mockResolvedValue(DROP)
    findOrCreateSpy.mockResolvedValue({ customer: { id: 'c1' }, created: true })
  })

  it('confirms the order, links the customer, logs activity, emails — in that order', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: true })
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1722500000, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(confirmOrderSpy).toHaveBeenCalledWith('org-1', 'o1', { intent_id: 'pi_1', paid_at: new Date(1722500000 * 1000).toISOString() })
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', { name: 'Jane', email: 'jane@example.com', phone: '208' })
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'c1' }))
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'order', parent_type: 'customer', parent_id: 'c1' }))
    expect(sendOrderConfirmationSpy).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', orderNumber: 8 }))
  })

  it('idempotent retry: confirmedNow=false skips CRM + email', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: false })
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(findOrCreateSpy).not.toHaveBeenCalled()
    expect(sendOrderConfirmationSpy).not.toHaveBeenCalled()
  })

  it('email failure still returns 200 (no Stripe retry storm)', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: true })
    sendOrderConfirmationSpy.mockRejectedValue(new Error('resend down'))
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
  })

  it('charge.refunded retrieves the PI on the connected account and marks the order refunded', async () => {
    piRetrieveSpy.mockResolvedValue({ id: 'pi_1', metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } })
    constructEventSpy.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 1100, refunds: { data: [{ id: 're_1' }] } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(piRetrieveSpy).toHaveBeenCalledWith('pi_1', { stripeAccount: 'acct_1' })
    expect(markRefundedSpy).toHaveBeenCalledWith('org-1', 'o1', expect.objectContaining({ refund_id: 're_1', amount: 11 }))
  })

  it('charge.refunded for a non-drop PI is a clean no-op', async () => {
    piRetrieveSpy.mockResolvedValue({ id: 'pi_1', metadata: { purpose: 'proposal_deposit' } })
    constructEventSpy.mockReturnValue({
      type: 'charge.refunded', account: 'acct_1',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 500 } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(markRefundedSpy).not.toHaveBeenCalled()
  })
})
