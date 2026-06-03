import { describe, it, expect, vi, beforeEach } from 'vitest'

const familyUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const campGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }))
const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [{
              ref: { update: familyUpdateSpy },
              data: () => ({
                id: 'fam-1',
                payment_status: 'unpaid',
                org_id: 'org-1',
                camp_id: 'camp-1',
                first_name: 'Jane',
                email: 'jane@example.com',
                camp_name: 'Summer Camp',
                org_name: 'Test Org',
                org_slug: 'test-org',
                camp_slug: 'summer-camp',
                access_token: null,
              }),
            }],
          }),
        }),
      }),
    }),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: campGetSpy,
          }),
        }),
      }),
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

import { POST } from '@/app/api/payments/webhook/route'

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => (key === 'stripe-signature' ? 'test-sig' : null),
    })
  })

  it('returns 400 on invalid signature', async () => {
    constructEventSpy.mockImplementation(() => { throw new Error('Bad sig') })
    const req = new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('marks family as paid on payment_intent.succeeded', async () => {
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount: 15000,
          metadata: { familyId: 'fam-1' },
        },
      },
    })
    const req = new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: '{"type":"payment_intent.succeeded"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(familyUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        amount_paid: 150, // 15000 cents → $150
      })
    )
  })
})
