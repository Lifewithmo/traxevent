import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserSpy = vi.hoisted(() => vi.fn())
const memberGetSpy = vi.hoisted(() => vi.fn())
const networkMemberGetSpy = vi.hoisted(() => vi.fn())
// assertCampPage now also reads the camp doc to resolve its department; default to a null-department camp.
const campGetSpy = vi.hoisted(() => vi.fn(() => Promise.resolve({ exists: true, data: () => ({ department_id: null }) })))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: getCurrentUserSpy }))
vi.mock('@/lib/firebase-admin', () => {
  const membersChain = { doc: vi.fn().mockReturnValue({ get: memberGetSpy }) }
  const campsChain = { doc: vi.fn().mockReturnValue({ get: campGetSpy }) }
  const networkMembersChain = { doc: vi.fn().mockReturnValue({ get: networkMemberGetSpy }) }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'camps') return campsChain
      return membersChain
    }),
  }
  const networkDoc = { collection: vi.fn().mockReturnValue(networkMembersChain) }
  return {
    adminDb: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'networks') return { doc: vi.fn().mockReturnValue(networkDoc) }
        return { doc: vi.fn().mockReturnValue(orgDoc) }
      }),
    },
  }
})

import { assertOrgMember, assertOrgAdmin, assertCampPage, assertNetworkAdmin } from '@/lib/auth/assert'

const member = (o = {}) => ({ exists: true, data: () => ({ uid: 'u1', role: 'staff', display_name: 'S', email: 's@x.org', camp_access: {}, ...o }) })

describe('assertOrgMember', () => {
  beforeEach(() => vi.clearAllMocks())
  it('throws Unauthorized when no session', async () => {
    getCurrentUserSpy.mockResolvedValue(null)
    await expect(assertOrgMember('org-1')).rejects.toThrow('Unauthorized')
  })
  it('throws Forbidden when caller belongs to a different org', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-2', role: 'admin' })
    await expect(assertOrgMember('org-1')).rejects.toThrow('Forbidden')
  })
  it('throws Forbidden when no member doc exists', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'staff' })
    memberGetSpy.mockResolvedValue({ exists: false })
    await expect(assertOrgMember('org-1')).rejects.toThrow('Forbidden')
  })
  it('returns the member for a valid org member', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'staff' })
    memberGetSpy.mockResolvedValue(member())
    const m = await assertOrgMember('org-1')
    expect(m.uid).toBe('u1')
  })
})

describe('assertOrgAdmin', () => {
  beforeEach(() => vi.clearAllMocks())
  it('throws Forbidden for staff', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'staff' })
    memberGetSpy.mockResolvedValue(member({ role: 'staff' }))
    await expect(assertOrgAdmin('org-1')).rejects.toThrow('Forbidden')
  })
  it('allows owner/admin', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'admin' })
    memberGetSpy.mockResolvedValue(member({ role: 'admin' }))
    await expect(assertOrgAdmin('org-1')).resolves.toBeTruthy()
  })
})

describe('assertCampPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('throws Forbidden when staff lacks the page grant', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'staff' })
    memberGetSpy.mockResolvedValue(member({ camp_access: { 'camp-1': { pages: ['families'] } } }))
    await expect(assertCampPage('org-1', 'camp-1', 'budget')).rejects.toThrow('Forbidden')
  })
  it('allows staff with the page grant', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', orgId: 'org-1', role: 'staff' })
    memberGetSpy.mockResolvedValue(member({ camp_access: { 'camp-1': { pages: ['families'] } } }))
    await expect(assertCampPage('org-1', 'camp-1', 'families')).resolves.toBeTruthy()
  })
})

describe('assertNetworkAdmin', () => {
  beforeEach(() => vi.clearAllMocks())
  const networkMember = (o = {}) => ({ exists: true, data: () => ({ uid: 'u1', role: 'admin', display_name: 'A', email: 'a@x.org', ...o }) })
  it('throws Unauthorized when no session', async () => {
    getCurrentUserSpy.mockResolvedValue(null)
    await expect(assertNetworkAdmin('net-1')).rejects.toThrow('Unauthorized')
  })
  it('throws Forbidden when caller belongs to a different network', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', networkId: 'net-2', role: 'admin' })
    await expect(assertNetworkAdmin('net-1')).rejects.toThrow('Forbidden')
  })
  it('throws Forbidden when no member doc exists', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', networkId: 'net-1', role: 'admin' })
    networkMemberGetSpy.mockResolvedValue({ exists: false })
    await expect(assertNetworkAdmin('net-1')).rejects.toThrow('Forbidden')
  })
  it('returns the member for a valid network admin', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1', networkId: 'net-1', role: 'admin' })
    networkMemberGetSpy.mockResolvedValue(networkMember())
    const m = await assertNetworkAdmin('net-1')
    expect(m.uid).toBe('u1')
  })
})
