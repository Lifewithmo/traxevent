import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrgByHandleSpy = vi.hoisted(() => vi.fn())
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const listOrdersSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const getOrderByTokenSpy = vi.hoisted(() => vi.fn())
const checkRateLimitSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }))
const findOrCreateSpy = vi.hoisted(() => vi.fn())
const customerUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const unsubQueryGetSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ get: () => '1.2.3.4' }))

vi.mock('@/lib/public-profile-server', () => ({ getOrgByHandle: getOrgByHandleSpy }))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/storefront/orders', () => ({ listOrdersForDropCore: listOrdersSpy, getOrderByTokenCore: getOrderByTokenSpy }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/crm/customers', () => ({
  findOrCreateCustomerCore: findOrCreateSpy,
  customersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: customerUpdateSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: unsubQueryGetSpy }) }),
    }),
  },
}))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { getPublicDrop, getPublicOrder, subscribeToDrops, unsubscribeByToken } from '@/actions/storefront-public'

const ORG = {
  id: 'org-1', name: 'Love Brew LLC', tips_enabled: true,
  branding: { display_name: 'Love Brew', accent_color: '#78350f' },
  public_profile: { enabled: true, handle: 'lovebrew', links: [] },
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled',
  opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 1 }],
  channels: ['email'], order_seq: 3, created_at: 'x',
}

describe('getPublicDrop', () => {
  beforeEach(() => { vi.clearAllMocks(); listOrdersSpy.mockResolvedValue([]) })

  it('projects the drop with derived phase and sold_out flags; strips stock counts and internals', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(DROP)
    listOrdersSpy.mockResolvedValue([{ status: 'confirmed', lines: [{ product_id: 'p1', qty: 1 }] }])
    const out = await getPublicDrop('lovebrew', 'd1')
    expect(out!.phase).toBe('open')
    expect(out!.items[0]).toEqual({ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, sold_out: true })
    expect(out!.org).toEqual({ display_name: 'Love Brew', handle: 'lovebrew', accent_color: '#78350f' })
    expect(out).not.toHaveProperty('order_seq')
    expect(out).not.toHaveProperty('channels')
    expect(JSON.stringify(out)).not.toContain('"stock"')
    expect(Object.keys(out!.pickup.windows[0]).sort()).toEqual(['day', 'end', 'id', 'start'])
  })

  it('returns null for unknown handle, unknown drop, and draft/archived drops', async () => {
    getOrgByHandleSpy.mockResolvedValue(null)
    expect(await getPublicDrop('nope', 'd1')).toBeNull()
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(null)
    expect(await getPublicDrop('lovebrew', 'd1')).toBeNull()
    getDropCoreSpy.mockResolvedValue({ ...DROP, status: 'draft' })
    expect(await getPublicDrop('lovebrew', 'd1')).toBeNull()
  })
})

describe('getPublicOrder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('projects status page fields and never leaks token/org_id/customer_id', async () => {
    getOrderByTokenSpy.mockResolvedValue({
      id: 'o1', org_id: 'org-1', drop_id: 'd1', status: 'confirmed', number: 8,
      buyer: { name: 'Jane', email: 'jane@example.com' },
      lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
      pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 'tok', created_at: 'x',
    })
    getDropCoreSpy.mockResolvedValue(DROP)
    const out = await getPublicOrder('tok')
    expect(out!.number).toBe(8)
    expect(out!.pickup).toEqual({ location_name: 'SW Boise', day: '2026-08-22', start: '08:00', end: '11:00' })
    const json = JSON.stringify(out)
    expect(json).not.toContain('org-1')
    expect(json).not.toContain('"token"')
    expect(json).not.toContain('jane@example.com')   // buyer_name only
    expect(Object.keys(out!.lines[0]).sort()).toEqual(['name', 'price', 'product_id', 'qty'])
  })

  it('returns null for unknown tokens', async () => {
    getOrderByTokenSpy.mockResolvedValue(null)
    expect(await getPublicOrder('nope')).toBeNull()
  })
})

describe('subscribeToDrops', () => {
  beforeEach(() => { vi.clearAllMocks(); checkRateLimitSpy.mockResolvedValue({ allowed: true }) })

  it('honeypot and time gate return fake success with zero writes', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    expect(await subscribeToDrops('lovebrew', { email: 'a@b.co', website: 'spam' }, 9999)).toEqual({ ok: true })
    expect(await subscribeToDrops('lovebrew', { email: 'a@b.co' }, 100)).toEqual({ ok: true })
    expect(findOrCreateSpy).not.toHaveBeenCalled()
  })

  it('subscribes: dedups the customer and writes marketing with a minted token', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    findOrCreateSpy.mockResolvedValue({ customer: { id: 'c1' }, created: true })
    await subscribeToDrops('lovebrew', { name: 'Jane', email: 'jane@example.com' }, 5000)
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ email: 'jane@example.com' }))
    const marketing = customerUpdateSpy.mock.calls[0][0].marketing
    expect(marketing.subscribed).toBe(true)
    expect(marketing.unsubscribe_token).toHaveLength(48)
  })

  it('keeps an existing unsubscribe_token on resubscribe', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    findOrCreateSpy.mockResolvedValue({
      customer: { id: 'c1', marketing: { subscribed: false, subscribed_at: 'x', source: 'profile', unsubscribe_token: 'K'.repeat(48) } },
      created: false,
    })
    await subscribeToDrops('lovebrew', { email: 'jane@example.com' }, 5000)
    expect(customerUpdateSpy.mock.calls[0][0].marketing.unsubscribe_token).toBe('K'.repeat(48))
  })

  it('rate-limits and rejects invalid emails', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    checkRateLimitSpy.mockResolvedValue({ allowed: false })
    await expect(subscribeToDrops('lovebrew', { email: 'jane@example.com' }, 5000)).rejects.toThrow('Too many')
    checkRateLimitSpy.mockResolvedValue({ allowed: true })
    await expect(subscribeToDrops('lovebrew', { email: 'nope' }, 5000)).rejects.toThrow('email')
  })
})

describe('unsubscribeByToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flips subscribed to false; unknown tokens report ok:false without throwing', async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined)
    unsubQueryGetSpy.mockResolvedValue({ empty: false, docs: [{ ref: { update: updateSpy } }] })
    expect(await unsubscribeByToken('T'.repeat(48))).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ 'marketing.subscribed': false }))
    unsubQueryGetSpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await unsubscribeByToken('nope')).toEqual({ ok: false })
  })
})
