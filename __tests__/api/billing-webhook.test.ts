import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted spies — must precede vi.mock() factories
const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const networkUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

// Collection-aware mock:
//   collection('networks').doc(id).update() -> networkUpdateSpy
//   collection('orgs').doc(id).update()     -> orgUpdateSpy
//   collection('orgs').where('network_id','==',id).get() -> 2 member docs (ref.update -> memberUpdateSpy)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'networks') {
        return {
          doc: vi.fn(() => ({ update: networkUpdateSpy })),
        }
      }
      // 'orgs'
      return {
        doc: vi.fn(() => ({ update: orgUpdateSpy })),
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            docs: [
              { ref: { update: memberUpdateSpy } },
              { ref: { update: memberUpdateSpy } },
            ],
          }),
        })),
      }
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventSpy,
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: getHeadersSpy,
}))

import { POST } from '@/app/api/billing/webhook/route'

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => (key === 'stripe-signature' ? 'test-sig' : null),
    })
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    getHeadersSpy.mockResolvedValue({ get: () => null })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when webhook signature is invalid', async () => {
    constructEventSpy.mockImplementation(() => { throw new Error('Bad sig') })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('sets billing_status active and stores stripe_customer_id on checkout.session.completed', async () => {
    constructEventSpy.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: 'org-1' },
          customer: 'cus_abc123',
        },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"checkout.session.completed"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      billing_status: 'active',
      stripe_customer_id: 'cus_abc123',
    })
  })

  it('sets billing_status inactive on customer.subscription.deleted', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { metadata: { orgId: 'org-1' } },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.deleted"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
  })

  it('sets billing_status inactive when subscription status is past_due', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { orgId: 'org-1' }, status: 'past_due' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
  })

  it('sets billing_status active when subscription status is active', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { orgId: 'org-1' }, status: 'active' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'active' })
  })

  it('activates network sub + cascades members to network_managed on checkout.session.completed with networkId', async () => {
    constructEventSpy.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { networkId: 'net-1' },
          customer: 'cus_net',
        },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"checkout.session.completed"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(networkUpdateSpy).toHaveBeenCalledWith({
      billing_status: 'active',
      stripe_customer_id: 'cus_net',
    })
    expect(memberUpdateSpy).toHaveBeenCalledWith({ billing_status: 'network_managed' })
    expect(memberUpdateSpy).toHaveBeenCalledTimes(2)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('deactivates network sub + cascades members to inactive on customer.subscription.deleted with networkId', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { metadata: { networkId: 'net-1' } },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.deleted"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(networkUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
    expect(memberUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
    expect(memberUpdateSpy).toHaveBeenCalledTimes(2)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('activates network sub + cascades members to network_managed on customer.subscription.updated active with networkId', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { networkId: 'net-1' }, status: 'active' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(networkUpdateSpy).toHaveBeenCalledWith({ billing_status: 'active' })
    expect(memberUpdateSpy).toHaveBeenCalledWith({ billing_status: 'network_managed' })
    expect(memberUpdateSpy).toHaveBeenCalledTimes(2)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('deactivates network sub + cascades members to inactive on customer.subscription.updated past_due with networkId', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { networkId: 'net-1' }, status: 'past_due' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(networkUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
    expect(memberUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
    expect(memberUpdateSpy).toHaveBeenCalledTimes(2)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('returns 200 without calling update for unrecognized event types', async () => {
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: { metadata: { orgId: 'org-1' } } },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"payment_intent.created"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })
})
