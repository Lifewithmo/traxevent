import { describe, it, expect, vi, beforeEach } from 'vitest'

const createPaymentIntentSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((col: string) => {
      if (col === 'orgs') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                empty: false,
                docs: [{
                  data: () => ({
                    id: 'org-1',
                    slug: 'acme',
                    stripe_account_id: 'acct_abc',
                  }),
                }],
              }),
            }),
          }),
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({
                    empty: false,
                    docs: [{
                      data: () => ({
                        id: 'camp-1',
                        slug: 'summer-2026',
                        payment_amount: 150,
                      }),
                    }],
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: createPaymentIntentSpy,
    },
  },
}))

import { POST } from '@/app/api/payments/intent/route'

describe('POST /api/payments/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPaymentIntentSpy.mockResolvedValue({
      client_secret: 'pi_test_secret_abc',
      id: 'pi_123',
    })
  })

  it('creates PaymentIntent with correct amount in cents, 1% application fee, and familyId in metadata', async () => {
    const req = new Request('http://localhost/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgSlug: 'acme', campSlug: 'summer-2026', familyId: 'fam-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(createPaymentIntentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15000,               // $150 × 100
        currency: 'usd',
        application_fee_amount: 150, // 1% of 15000
        metadata: { familyId: 'fam-1' },
      }),
      { stripeAccount: 'acct_abc' }
    )
    const body = await res.json()
    expect(body.clientSecret).toBe('pi_test_secret_abc')
    expect(body.stripeAccountId).toBe('acct_abc')
  })
})
