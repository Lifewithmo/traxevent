import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const networkDocGetSpy = vi.hoisted(() => vi.fn())
const memberDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberDocGetSpy = vi.hoisted(() => vi.fn())
const membersGetSpy = vi.hoisted(() => vi.fn())
const regionDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const regionsGetSpy = vi.hoisted(() => vi.fn())
const orgsWhereGetSpy = vi.hoisted(() => vi.fn())
const orgsSlugGetSpy = vi.hoisted(() => vi.fn())
const orgDocGetSpy = vi.hoisted(() => vi.fn())
const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invitationSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgSlugGetByValueSpy = vi.hoisted(() => vi.fn())
const getUserByEmailSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const membersCol = {
    doc: vi.fn().mockReturnValue({ set: memberDocSetSpy, get: memberDocGetSpy }),
    get: membersGetSpy,
  }
  let nextRegionId = 0
  const regionsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? `region-${++nextRegionId}`,
      set: regionDocSetSpy,
    })),
    get: regionsGetSpy,
  }
  const networksCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-net-id',
      set: networkDocSetSpy,
      get: networkDocGetSpy,
      collection: vi.fn().mockImplementation((sub: string) => {
        if (sub === 'regions') return regionsCol
        return membersCol
      }),
    })),
  }
  let nextOrgId = 0
  const orgsCol = {
    where: vi.fn().mockImplementation((field: string, _op: string, value?: string) => {
      if (field === 'slug') {
        // Per-value slug-existence lookup (used by uniqueOrgSlug); falls back to the
        // legacy single spy used by linkOrgToNetworkBySlug tests.
        return {
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => orgSlugGetByValueSpy(value) ?? orgsSlugGetSpy()),
          }),
        }
      }
      return { get: orgsWhereGetSpy }
    }),
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? `org-${++nextOrgId}`,
      get: orgDocGetSpy,
      update: orgDocUpdateSpy,
      set: orgDocSetSpy,
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({ set: invitationSetSpy }),
      }),
    })),
  }
  return {
    adminDb: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'networks') return networksCol
        if (name === 'orgs') return orgsCol
        return {}
      }),
    },
    adminAuth: { getUserByEmail: getUserByEmailSpy },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertNetworkAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertNetworkMember: vi.fn().mockResolvedValue({ uid: 'admin-uid', role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

const setNetworkClaimsSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/actions/auth', () => ({
  setNetworkClaims: setNetworkClaimsSpy,
}))

import {
  createNetwork,
  listNetworkOrgs,
  linkOrgToNetwork,
  linkOrgToNetworkBySlug,
  bulkOnboardOrgs,
  createRegion,
  assignOrgToRegion,
  assignCoordinator,
} from '@/actions/networks'
import { assertNetworkAdmin, assertNetworkMember, assertOrgAdmin } from '@/lib/auth/assert'

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

  it('listNetworkOrgs scopes a coordinator to their regions only', async () => {
    vi.mocked(assertNetworkMember).mockResolvedValueOnce({
      uid: 'c1',
      role: 'coordinator',
      display_name: '',
      email: 'c@x.org',
      region_ids: ['r1'],
    })
    orgsWhereGetSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'org-r1', name: 'In R1', network_id: 'net-1', region_id: 'r1' }) },
        { data: () => ({ id: 'org-r2', name: 'In R2', network_id: 'net-1', region_id: 'r2' }) },
        { data: () => ({ id: 'org-none', name: 'No Region', network_id: 'net-1', region_id: null }) },
      ],
    })
    const orgs = await listNetworkOrgs('net-1')
    expect(orgs).toHaveLength(1)
    expect(orgs[0].id).toBe('org-r1')
  })

  describe('regions + coordinators', () => {
    it('createRegion asserts network admin and writes a region doc', async () => {
      const region = await createRegion('net-1', '  North  ')
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(regionDocSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: region.id, name: 'North', created_at: expect.any(String) })
      )
      expect(region.name).toBe('North')
      expect(region.id).toEqual(expect.any(String))
    })

    it('assignOrgToRegion updates an org that is in this network', async () => {
      orgDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'org-1', network_id: 'net-1' }) })
      await assignOrgToRegion('net-1', 'org-1', 'r1')
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(orgDocUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ region_id: 'r1', updated_at: expect.any(String) })
      )
    })

    it('assignOrgToRegion throws for an org in a different network and does not update', async () => {
      orgDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'org-2', network_id: 'other-net' }) })
      await expect(assignOrgToRegion('net-1', 'org-2', 'r1')).rejects.toThrow('Organization is not in this network')
      expect(orgDocUpdateSpy).not.toHaveBeenCalled()
    })

    it('assignOrgToRegion(null) clears the region', async () => {
      orgDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'org-1', network_id: 'net-1' }) })
      await assignOrgToRegion('net-1', 'org-1', null)
      expect(orgDocUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ region_id: null, updated_at: expect.any(String) })
      )
    })

    it('assignCoordinator resolves the email to a uid, writes the member doc, and sets claims', async () => {
      networkDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'net-1', slug: 'my-net' }) })
      getUserByEmailSpy.mockResolvedValue({ uid: 'u9' })
      regionsGetSpy.mockResolvedValue({
        docs: [
          { data: () => ({ id: 'r1', name: 'R1' }) },
          { data: () => ({ id: 'r2', name: 'R2' }) },
        ],
      })
      memberDocGetSpy.mockResolvedValue({ exists: false })
      await assignCoordinator('net-1', 'coord@x.org', ['r1', 'r2'])
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(getUserByEmailSpy).toHaveBeenCalledWith('coord@x.org')
      expect(memberDocSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'u9',
          role: 'coordinator',
          email: 'coord@x.org',
          display_name: '',
          region_ids: ['r1', 'r2'],
        })
      )
      expect(setNetworkClaimsSpy).toHaveBeenCalledWith('u9', 'net-1', 'my-net', 'coordinator')
    })

    it('assignCoordinator throws and writes nothing when no user is found for the email', async () => {
      networkDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'net-1', slug: 'my-net' }) })
      getUserByEmailSpy.mockRejectedValue(new Error('user-not-found'))
      await expect(assignCoordinator('net-1', 'nobody@x.org', ['r1'])).rejects.toThrow('No user found with that email')
      expect(memberDocSetSpy).not.toHaveBeenCalled()
      expect(setNetworkClaimsSpy).not.toHaveBeenCalled()
    })

    it('assignCoordinator throws and writes nothing when a regionId is not in the network', async () => {
      networkDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'net-1', slug: 'my-net' }) })
      getUserByEmailSpy.mockResolvedValue({ uid: 'u9' })
      regionsGetSpy.mockResolvedValue({
        docs: [{ data: () => ({ id: 'r1', name: 'R1' }) }],
      })
      memberDocGetSpy.mockResolvedValue({ exists: false })
      await expect(assignCoordinator('net-1', 'coord@x.org', ['r1', 'r-bogus'])).rejects.toThrow('Invalid region selection')
      expect(memberDocSetSpy).not.toHaveBeenCalled()
      expect(setNetworkClaimsSpy).not.toHaveBeenCalled()
    })

    it('assignCoordinator throws and writes nothing when the user is already a network admin', async () => {
      networkDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'net-1', slug: 'my-net' }) })
      getUserByEmailSpy.mockResolvedValue({ uid: 'u9' })
      regionsGetSpy.mockResolvedValue({
        docs: [{ data: () => ({ id: 'r1', name: 'R1' }) }],
      })
      memberDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ uid: 'u9', role: 'admin' }) })
      await expect(assignCoordinator('net-1', 'coord@x.org', ['r1'])).rejects.toThrow('User is already a network admin')
      expect(memberDocSetSpy).not.toHaveBeenCalled()
      expect(setNetworkClaimsSpy).not.toHaveBeenCalled()
    })
  })

  it('linkOrgToNetwork asserts network + org admin then updates the org', async () => {
    await linkOrgToNetwork('net-1', 'org-1')
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ network_id: 'net-1', updated_at: expect.any(String) })
    )
  })

  it('linkOrgToNetworkBySlug throws when no org matches the slug', async () => {
    orgsSlugGetSpy.mockResolvedValue({ empty: true, docs: [] })
    await expect(linkOrgToNetworkBySlug('net-1', 'nope')).rejects.toThrow('No organization found')
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('linkOrgToNetworkBySlug resolves the slug then links through to the org update', async () => {
    orgsSlugGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'org-99' }] })
    await linkOrgToNetworkBySlug('net-1', 'my-org')
    expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-99')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ network_id: 'net-1', updated_at: expect.any(String) })
    )
  })

  describe('bulkOnboardOrgs', () => {
    beforeEach(() => {
      // Default: every slug is free.
      orgSlugGetByValueSpy.mockReturnValue({ empty: true, docs: [] })
    })

    it('creates an org + owner invitation per valid row, linked to the network', async () => {
      const results = await bulkOnboardOrgs('net-1', [
        { orgName: 'First Baptist', adminEmail: 'a@first.org' },
        { orgName: 'Second Church', adminEmail: 'b@second.org' },
      ])

      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(orgDocSetSpy).toHaveBeenCalledTimes(2)
      expect(orgDocSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'First Baptist',
          slug: expect.any(String),
          network_id: 'net-1',
          billing_status: 'trialing',
          created_at: expect.any(String),
        })
      )
      expect(invitationSetSpy).toHaveBeenCalledTimes(2)
      expect(invitationSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'owner', email: 'a@first.org' })
      )
      expect(invitationSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'owner', email: 'b@second.org' })
      )

      expect(results).toHaveLength(2)
      for (const r of results) {
        expect(r.status).toBe('created')
        expect(r.slug).toEqual(expect.any(String))
        expect(r.inviteToken).toEqual(expect.any(String))
      }
    })

    it('assigns a unique slug when the base slug is taken', async () => {
      orgSlugGetByValueSpy.mockImplementation((slug?: string) => {
        if (slug === 'first-baptist') return { empty: false, docs: [{ id: 'existing' }] }
        return { empty: true, docs: [] }
      })

      const results = await bulkOnboardOrgs('net-1', [
        { orgName: 'First Baptist', adminEmail: 'a@first.org' },
      ])

      expect(results[0].slug).toBe('first-baptist-2')
      expect(orgDocSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'first-baptist-2' })
      )
    })

    it('returns an error row and creates no org for rows with a parse error', async () => {
      const results = await bulkOnboardOrgs('net-1', [
        { orgName: 'Bad Row', adminEmail: '', error: 'Invalid email address' },
      ])

      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('error')
      expect(orgDocSetSpy).not.toHaveBeenCalled()
      expect(invitationSetSpy).not.toHaveBeenCalled()
    })
  })
})
