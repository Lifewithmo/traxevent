import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgsWhereGetSpy = vi.hoisted(() => vi.fn())
const orgsSlugGetSpy = vi.hoisted(() => vi.fn())
const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invitationSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgSlugGetByValueSpy = vi.hoisted(() => vi.fn())

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

import { createNetwork, listNetworkOrgs, linkOrgToNetwork, linkOrgToNetworkBySlug, bulkOnboardOrgs } from '@/actions/networks'
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
