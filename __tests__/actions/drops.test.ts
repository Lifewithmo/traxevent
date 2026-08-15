import { describe, it, expect, vi, beforeEach } from 'vitest'

const publishDropCoreSpy = vi.hoisted(() => vi.fn())
const dropUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgGetSpy = vi.hoisted(() => vi.fn())
const subsGetSpy = vi.hoisted(() => vi.fn())
const batchSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const getVerifiedSendingDomainSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))
vi.mock('@/lib/storefront/drops', () => ({
  publishDropCore: publishDropCoreSpy,
  dropsRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: dropUpdateSpy }) }),
  // passthroughs used by the other actions in this file:
  listDropsCore: vi.fn(), getDropCore: vi.fn(), createDropCore: vi.fn(), updateDraftDropCore: vi.fn(),
  closeDropCore: vi.fn(), archiveDropCore: vi.fn(), adjustStockCore: vi.fn(),
}))
vi.mock('@/lib/crm/customers', () => ({
  customersRef: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ get: subsGetSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orgGetSpy }) }) },
}))
vi.mock('@/lib/resend', () => ({
  getResend: () => ({ batch: { send: batchSendSpy } }),
  // the real lib/email builds announcement payloads with buildFromAddress —
  // it must exist here or the best-effort catch swallows the batch send
  buildFromAddress: (o: { displayName?: string }) => `"${o.displayName ?? 'x'}" <noreply@test>`,
}))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: getVerifiedSendingDomainSpy }))

import { publishDrop } from '@/actions/drops'

const ORG = {
  name: 'Love Brew LLC', stripe_account_id: 'acct_1',
  branding: { display_name: 'Love Brew' },
  public_profile: { enabled: true, handle: 'lovebrew' },
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled', channels: ['email'],
  opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', timezone: 'UTC',
  pickup: { location_name: 'x', windows: [] }, items: [{ product_id: 'p1', name: 'x', price: 5 }], created_at: 'x',
}

describe('publishDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ORG })
    publishDropCoreSpy.mockResolvedValue(DROP)
    subsGetSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'c1', email: 'fan@example.com', marketing: { subscribed: true, unsubscribe_token: 'U'.repeat(48) } }) },
      ],
    })
  })

  it('gates on Stripe connection and public-profile handle', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...ORG, stripe_account_id: undefined }) })
    await expect(publishDrop('org-1', 'd1')).rejects.toThrow('Stripe')
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...ORG, public_profile: { enabled: false } }) })
    await expect(publishDrop('org-1', 'd1')).rejects.toThrow('public profile')
    expect(publishDropCoreSpy).not.toHaveBeenCalled()
  })

  it('publishes and sends the announcement batch with drop + unsubscribe links, stamping announced_at', async () => {
    const out = await publishDrop('org-1', 'd1')
    expect(out.status).toBe('scheduled')
    expect(batchSendSpy).toHaveBeenCalledTimes(1)
    const payloads = batchSendSpy.mock.calls[0][0]
    expect(payloads[0].to).toBe('fan@example.com')
    expect(payloads[0].html).toContain('/p/lovebrew/drops/d1')
    expect(payloads[0].html).toContain(`/unsubscribe/${'U'.repeat(48)}`)
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ announced_at: expect.any(String) }))
  })

  it('skips the announcement when email is not a selected channel', async () => {
    publishDropCoreSpy.mockResolvedValue({ ...DROP, channels: [] })
    await publishDrop('org-1', 'd1')
    expect(batchSendSpy).not.toHaveBeenCalled()
    expect(dropUpdateSpy).not.toHaveBeenCalled()
  })

  it('announcement failure does not fail the publish', async () => {
    batchSendSpy.mockRejectedValue(new Error('resend down'))
    const out = await publishDrop('org-1', 'd1')
    expect(out.status).toBe('scheduled')
  })

  it('does not stamp announced_at when Resend resolves the batch with an error (SDK does not reject on failure)', async () => {
    batchSendSpy.mockResolvedValue({ data: null, error: { message: 'invalid api key' } })
    const out = await publishDrop('org-1', 'd1')
    expect(out.status).toBe('scheduled')
    expect(dropUpdateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ announced_at: expect.any(String) }))
  })
})
