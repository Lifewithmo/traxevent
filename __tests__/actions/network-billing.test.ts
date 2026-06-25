import { describe, it, expect, vi, beforeEach } from 'vitest'

const createCheckoutSpy = vi.hoisted(() => vi.fn())
const createPortalSpy = vi.hoisted(() => vi.fn())
const assertNetworkAdminSpy = vi.hoisted(() => vi.fn())
const networkGetSpy = vi.hoisted(() => vi.fn())
const orgsGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: createCheckoutSpy } },
    billingPortal: { sessions: { create: createPortalSpy } },
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertNetworkAdmin: assertNetworkAdminSpy,
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((col: string) => {
      if (col === 'networks') {
        return {
          doc: vi.fn(() => ({
            get: networkGetSpy,
          })),
        }
      }
      if (col === 'orgs') {
        return {
          where: vi.fn(() => ({
            get: orgsGetSpy,
          })),
        }
      }
      return {}
    }),
  },
}))

import {
  createNetworkCheckoutSession,
  createNetworkBillingPortalSession,
} from '@/actions/network-billing'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_NETWORK_PRICE_ID = 'price_net'
  process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost'
  assertNetworkAdminSpy.mockResolvedValue(undefined)
})

describe('createNetworkCheckoutSession', () => {
  it('counts member orgs (size 3) and creates a per-seat subscription session', async () => {
    networkGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ stripe_customer_id: 'cus_net' }),
    })
    orgsGetSpy.mockResolvedValue({ size: 3, docs: [] })
    createCheckoutSpy.mockResolvedValue({ url: 'https://stripe.test/checkout' })

    const url = await createNetworkCheckoutSession('net-1', 'acme-net')

    expect(assertNetworkAdminSpy).toHaveBeenCalledWith('net-1')
    expect(createCheckoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_net', quantity: 3 }],
        metadata: { networkId: 'net-1' },
        subscription_data: { metadata: { networkId: 'net-1' } },
        customer: 'cus_net',
      })
    )
    expect(url).toBe('https://stripe.test/checkout')
  })

  it('floors quantity to 1 when the network has 0 member orgs', async () => {
    networkGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({}),
    })
    orgsGetSpy.mockResolvedValue({ size: 0, docs: [] })
    createCheckoutSpy.mockResolvedValue({ url: 'https://stripe.test/checkout' })

    await createNetworkCheckoutSession('net-1', 'acme-net')

    expect(createCheckoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_net', quantity: 1 }],
      })
    )
  })

  it('throws when Stripe does not return a session URL', async () => {
    networkGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({}),
    })
    orgsGetSpy.mockResolvedValue({ size: 2, docs: [] })
    createCheckoutSpy.mockResolvedValue({ url: null })

    await expect(
      createNetworkCheckoutSession('net-1', 'acme-net')
    ).rejects.toThrow('Stripe did not return a session URL')
  })
})

describe('createNetworkBillingPortalSession', () => {
  it('throws when the network has no stripe_customer_id', async () => {
    networkGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({}),
    })

    await expect(
      createNetworkBillingPortalSession('net-1', 'acme-net')
    ).rejects.toThrow('No Stripe customer found — subscribe first')
  })

  it('creates a billing portal session and returns its url', async () => {
    networkGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ stripe_customer_id: 'cus_net' }),
    })
    createPortalSpy.mockResolvedValue({ url: 'https://stripe.test/portal' })

    const url = await createNetworkBillingPortalSession('net-1', 'acme-net')

    expect(createPortalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_net' })
    )
    expect(url).toBe('https://stripe.test/portal')
  })
})
