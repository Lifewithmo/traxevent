import { describe, it, expect, vi, beforeEach } from 'vitest'

const networkUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const portalDomainGetSpy = vi.hoisted(() => vi.fn())

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
      return { limit: vi.fn().mockReturnValue({ get: vi.fn() }) }
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'networks') return networksCol
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
} from '@/actions/network-portal'
import { assertNetworkAdmin } from '@/lib/auth/assert'

describe('network-portal admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    networkUpdateSpy.mockResolvedValue(undefined)
    // Default: domain is free.
    portalDomainGetSpy.mockResolvedValue({ empty: true, docs: [] })
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
})
