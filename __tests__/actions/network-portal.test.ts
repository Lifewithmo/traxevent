import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const portalDomainGetSpy = vi.hoisted(() => vi.fn())
const networkSlugGetSpy = vi.hoisted(() => vi.fn())
const orgsByNetworkGetSpy = vi.hoisted(() => vi.fn())
const campsGetSpy = vi.hoisted(() => vi.fn())
const campsWhereSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const networksCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-net-id',
      update: networkUpdateSpy,
    })),
    where: vi.fn().mockImplementation((field: string, _op: string, _value?: string) => {
      if (field === 'portal_domain') {
        return { limit: vi.fn().mockReturnValue({ get: portalDomainGetSpy }) }
      }
      if (field === 'slug') {
        return { limit: vi.fn().mockReturnValue({ get: networkSlugGetSpy }) }
      }
      return { limit: vi.fn().mockReturnValue({ get: vi.fn() }) }
    }),
  }
  const orgsCol = {
    // orgs.where('network_id','==',id).get()
    where: vi.fn().mockImplementation((_field: string, _op: string, _value?: string) => ({
      get: orgsByNetworkGetSpy,
    })),
    // orgs.doc(orgId).collection('camps').where('status','==','active').get()
    doc: vi.fn().mockImplementation((_orgId?: string) => ({
      collection: vi.fn().mockImplementation((sub: string) => {
        if (sub === 'camps') {
          return {
            where: campsWhereSpy.mockReturnValue({ get: campsGetSpy }),
          }
        }
        return {}
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
}))

import {
  updateNetworkBranding,
  setNetworkPortalDomain,
  removeNetworkPortalDomain,
  getNetworkPortalBySlug,
  getNetworkPortalByDomain,
} from '@/actions/network-portal'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'

describe('network-portal admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    networkUpdateSpy.mockResolvedValue(undefined)
    // Default: domain is free.
    portalDomainGetSpy.mockResolvedValue({ empty: true, docs: [] })
    networkSlugGetSpy.mockResolvedValue({ empty: true, docs: [] })
    orgsByNetworkGetSpy.mockResolvedValue({ docs: [] })
    campsGetSpy.mockResolvedValue({ docs: [] })
    campsWhereSpy.mockReturnValue({ get: campsGetSpy })
  })

  describe('updateNetworkBranding', () => {
    it('asserts network admin and updates the provided branding fields', async () => {
      await updateNetworkBranding('net-1', {
        display_name: '  Grace Network  ',
        logo_url: 'https://cdn.example.org/logo.png  ',
        primary_color: '#2563EB',
        accent_color: '#059669',
      })
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(networkUpdateSpy).toHaveBeenCalledWith({
        display_name: 'Grace Network',
        logo_url: 'https://cdn.example.org/logo.png',
        primary_color: '#2563EB',
        accent_color: '#059669',
      })
    })

    it('rejects a non-hex color and does not update', async () => {
      await expect(
        updateNetworkBranding('net-1', { primary_color: 'blue' })
      ).rejects.toThrow('Colors must be hex like #2563EB')
      expect(networkUpdateSpy).not.toHaveBeenCalled()
    })

    it('rejects a non-http logo_url and does not update', async () => {
      await expect(
        updateNetworkBranding('net-1', { logo_url: 'ftp://example.org/logo.png' })
      ).rejects.toThrow('Logo URL must start with http:// or https://')
      expect(networkUpdateSpy).not.toHaveBeenCalled()
    })
  })

  describe('setNetworkPortalDomain', () => {
    it('normalizes to trimmed lowercase and updates when the domain is free', async () => {
      await setNetworkPortalDomain('net-1', '  Camps.Yourdomain.ORG  ')
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(networkUpdateSpy).toHaveBeenCalledWith({ portal_domain: 'camps.yourdomain.org' })
    })

    it('rejects an invalid domain and does not update', async () => {
      await expect(
        setNetworkPortalDomain('net-1', 'not a domain')
      ).rejects.toThrow('Enter a valid domain (e.g. camps.yourdomain.org)')
      expect(networkUpdateSpy).not.toHaveBeenCalled()
    })

    it('throws when the domain is owned by a different network and does not update', async () => {
      portalDomainGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'other-net' }] })
      await expect(
        setNetworkPortalDomain('net-1', 'camps.yourdomain.org')
      ).rejects.toThrow('That domain is already in use')
      expect(networkUpdateSpy).not.toHaveBeenCalled()
    })

    it('allows updating when the domain is already owned by the same network', async () => {
      portalDomainGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'net-1' }] })
      await setNetworkPortalDomain('net-1', 'camps.yourdomain.org')
      expect(networkUpdateSpy).toHaveBeenCalledWith({ portal_domain: 'camps.yourdomain.org' })
    })
  })

  describe('removeNetworkPortalDomain', () => {
    it('asserts network admin and clears the portal_domain', async () => {
      await removeNetworkPortalDomain('net-1')
      expect(assertNetworkAdmin).toHaveBeenCalledWith('net-1')
      expect(networkUpdateSpy).toHaveBeenCalledWith({ portal_domain: null })
    })
  })

  describe('getNetworkPortalBySlug', () => {
    it('returns null for an unknown slug', async () => {
      networkSlugGetSpy.mockResolvedValue({ empty: true, docs: [] })
      const result = await getNetworkPortalBySlug('nope')
      expect(result).toBeNull()
    })

    it('returns { network, events } built from member orgs active camps', async () => {
      networkSlugGetSpy.mockResolvedValue({
        empty: false,
        docs: [{ id: 'net-1', data: () => ({ name: 'Grace Network', slug: 'grace' }) }],
      })
      orgsByNetworkGetSpy.mockResolvedValue({
        docs: [{ id: 'org-1', data: () => ({ name: 'First Baptist', slug: 'fbc' }) }],
      })
      campsGetSpy.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'Summer Camp',
              slug: 'summer',
              year: 2026,
              status: 'active',
              camp_start: '2026-07-01',
              camp_end: '2026-07-07',
            }),
          },
        ],
      })

      const result = await getNetworkPortalBySlug('grace')
      expect(result).not.toBeNull()
      expect(result!.network).toMatchObject({ id: 'net-1', name: 'Grace Network', slug: 'grace' })
      expect(result!.events).toHaveLength(1)
      expect(result!.events[0]).toMatchObject({
        orgName: 'First Baptist',
        campName: 'Summer Camp',
        registerPath: '/fbc/summer/register',
      })
      // active-camps filter was applied
      expect(campsWhereSpy).toHaveBeenCalledWith('status', '==', 'active')
    })

    it('does not expose stripe_customer_id or billing_status on the public network', async () => {
      networkSlugGetSpy.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'net-1',
            data: () => ({
              name: 'Grace Network',
              slug: 'grace',
              display_name: 'Grace',
              logo_url: 'https://cdn.example.org/logo.png',
              primary_color: '#2563EB',
              accent_color: '#059669',
              portal_domain: 'camps.grace.org',
              stripe_customer_id: 'cus_SECRET123',
              billing_status: 'active',
            }),
          },
        ],
      })
      orgsByNetworkGetSpy.mockResolvedValue({ docs: [] })

      const result = await getNetworkPortalBySlug('grace')
      expect(result).not.toBeNull()
      // public-facing branding is present
      expect(result!.network).toEqual({
        id: 'net-1',
        name: 'Grace Network',
        slug: 'grace',
        display_name: 'Grace',
        logo_url: 'https://cdn.example.org/logo.png',
        primary_color: '#2563EB',
        accent_color: '#059669',
      })
      // sensitive/internal fields are structurally absent
      expect('stripe_customer_id' in result!.network).toBe(false)
      expect('billing_status' in result!.network).toBe(false)
      expect('portal_domain' in result!.network).toBe(false)
    })

    it('excludes inactive member orgs and includes active/trialing orgs', async () => {
      networkSlugGetSpy.mockResolvedValue({
        empty: false,
        docs: [{ id: 'net-1', data: () => ({ name: 'Grace Network', slug: 'grace' }) }],
      })
      orgsByNetworkGetSpy.mockResolvedValue({
        docs: [
          { id: 'org-active', data: () => ({ name: 'Active Org', slug: 'active-org', billing_status: 'active' }) },
          { id: 'org-trial', data: () => ({ name: 'Trial Org', slug: 'trial-org', billing_status: 'trialing' }) },
          { id: 'org-inactive', data: () => ({ name: 'Inactive Org', slug: 'inactive-org', billing_status: 'inactive' }) },
        ],
      })
      campsGetSpy.mockImplementation(async () => ({
        docs: [
          {
            data: () => ({
              name: 'Summer Camp',
              slug: 'summer',
              year: 2026,
              status: 'active',
              camp_start: '2026-07-01',
              camp_end: '2026-07-07',
            }),
          },
        ],
      }))

      const result = await getNetworkPortalBySlug('grace')
      expect(result).not.toBeNull()
      const orgNames = result!.events.map((e) => e.orgName)
      expect(orgNames).toContain('Active Org')
      expect(orgNames).toContain('Trial Org')
      expect(orgNames).not.toContain('Inactive Org')
    })
  })

  describe('getNetworkPortalByDomain', () => {
    it('returns null for an unknown host', async () => {
      portalDomainGetSpy.mockResolvedValue({ empty: true, docs: [] })
      const result = await getNetworkPortalByDomain('Camps.Unknown.ORG')
      expect(result).toBeNull()
    })

    it('lowercases the host and returns { network, events } when known', async () => {
      portalDomainGetSpy.mockResolvedValue({
        empty: false,
        docs: [{ id: 'net-1', data: () => ({ name: 'Grace Network', slug: 'grace', portal_domain: 'camps.grace.org' }) }],
      })
      orgsByNetworkGetSpy.mockResolvedValue({
        docs: [{ id: 'org-1', data: () => ({ name: 'First Baptist', slug: 'fbc' }) }],
      })
      campsGetSpy.mockResolvedValue({
        docs: [
          {
            data: () => ({
              name: 'Summer Camp',
              slug: 'summer',
              year: 2026,
              status: 'active',
              camp_start: '2026-07-01',
              camp_end: '2026-07-07',
            }),
          },
        ],
      })

      const result = await getNetworkPortalByDomain('  Camps.Grace.ORG  ')
      // host was normalized (trimmed + lowercased) before the lookup
      expect(adminDb.collection).toHaveBeenCalledWith('networks')
      const networksCol = (adminDb.collection as ReturnType<typeof vi.fn>).mock.results.find(
        (r) => r.value && typeof r.value.where === 'function' && r.value.doc
      )!.value
      expect(networksCol.where).toHaveBeenCalledWith('portal_domain', '==', 'camps.grace.org')
      expect(result).not.toBeNull()
      expect(result!.network).toMatchObject({ id: 'net-1', slug: 'grace' })
      expect(result!.events[0]).toMatchObject({ registerPath: '/fbc/summer/register' })
    })
  })
})
