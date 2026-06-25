import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgsWhereGetSpy = vi.hoisted(() => vi.fn())
const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => {
  const membersCol = {
    doc: vi.fn().mockReturnValue({ set: memberDocSetSpy }),
  }
  const networksCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-net-id',
      set: networkDocSetSpy,
      collection: vi.fn().mockReturnValue(membersCol),
    })),
  }
  const orgsCol = {
    where: vi.fn().mockReturnValue({ get: orgsWhereGetSpy }),
    doc: vi.fn().mockReturnValue({ update: orgDocUpdateSpy }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'networks') return networksCol
        if (name === 'orgs') return orgsCol
        return {}
      }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertNetworkAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

const setNetworkClaimsSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/actions/auth', () => ({
  setNetworkClaims: setNetworkClaimsSpy,
}))

import { createNetwork, listNetworkOrgs, linkOrgToNetwork } from '@/actions/networks'
import { assertNetworkAdmin, assertOrgAdmin } from '@/lib/auth/assert'

describe('networks actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createNetwork writes a network doc with slug + created_at, writes admin member, and sets claims', async () => {
    const net = await createNetwork('u1', 'First Network', 'Ann', 'a@x.org')
    expect(networkDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'First Network', slug: 'first-network', created_at: expect.any(String) })
    )
    expect(memberDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1', role: 'admin', display_name: 'Ann', email: 'a@x.org' })
    )
    expect(setNetworkClaimsSpy).toHaveBeenCalledWith('u1', net.id, 'first-network')
    expect(net.name).toBe('First Network')
    expect(net.slug).toBe('first-network')
  })

  it('listNetworkOrgs returns orgs from a network_id query', async () => {
    orgsWhereGetSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'org-1', name: 'Org One', network_id: 'net-1' }) }],
    })
    const orgs = await listNetworkOrgs('net-1')
    expect(orgs).toHaveLength(1)
    expect(orgs[0].id).toBe('org-1')
  })

  it('linkOrgToNetwork asserts network + org admin then updates the org', async () => {
    await linkOrgToNetwork('net-1', 'org-1')
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ network_id: 'net-1', updated_at: expect.any(String) })
    )
  })
})
