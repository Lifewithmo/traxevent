import { describe, it, expect } from 'vitest'
import {
  getIndustryPack,
  getAllIndustryPacks,
  isModuleEnabled,
  resolveEnabledModules,
  DEFAULT_INDUSTRY_PACK_ID,
  catalogLabel,
  storefrontLabel,
} from '@/lib/industry-packs'

const ALL_MODULES = [
  'leads', 'clients', 'proposals', 'invoices',
  'events', 'registrants', 'vendors', 'calendar', 'reports', 'forms',
] as const

describe('industry packs', () => {
  it('has a general pack that enables every currently-shipped module', () => {
    const general = getIndustryPack('general')
    expect(general.id).toBe('general')
    for (const m of ALL_MODULES) {
      expect(general.modules).toContain(m)
    }
  })

  it('falls back to general for an unknown id', () => {
    expect(getIndustryPack('does-not-exist').id).toBe(DEFAULT_INDUSTRY_PACK_ID)
  })

  it('falls back to general for undefined', () => {
    expect(getIndustryPack(undefined).id).toBe('general')
  })

  it('coffee-cart enables the sales spine + calendar + catalog, and hides registrants', () => {
    const cart = getIndustryPack('coffee-cart')
    expect(cart.modules).toContain('invoices')
    expect(cart.modules).toContain('catalog')
    expect(cart.modules).not.toContain('registrants')
  })

  it('coffee-cart enables vendors and events modules', () => {
    const cart = getIndustryPack('coffee-cart')
    expect(cart.modules).toContain('vendors')
    expect(cart.modules).toContain('events')
  })

  it('isModuleEnabled reflects pack membership', () => {
    const cart = getIndustryPack('coffee-cart')
    expect(isModuleEnabled(cart, 'invoices')).toBe(true)
    expect(isModuleEnabled(cart, 'registrants')).toBe(false)
  })

  it('resolveEnabledModules(undefined) returns the full general set', () => {
    expect(resolveEnabledModules(undefined)).toEqual(getIndustryPack('general').modules)
  })

  it('every pack references a non-empty event type id and a module list', () => {
    for (const pack of getAllIndustryPacks()) {
      expect(pack.eventTypeId).toBeTruthy()
      expect(pack.modules.length).toBeGreaterThan(0)
    }
  })

  it('general pack includes attendee-roster (existing orgs keep the roster)', () => {
    expect(getIndustryPack('general').modules).toContain('attendee-roster')
  })

  it('booked-job packs exclude attendee-roster (headcount path instead)', () => {
    for (const id of ['coffee-cart', 'caterer', 'florist', 'photographer']) {
      expect(getIndustryPack(id).modules).not.toContain('attendee-roster')
    }
  })

  it('resolveEnabledModules(undefined) includes attendee-roster (default = general)', () => {
    expect(resolveEnabledModules(undefined)).toContain('attendee-roster')
  })
})

describe('catalogLabel', () => {
  it('maps catalogKind to a vertical label', () => {
    expect(catalogLabel(getIndustryPack('coffee-cart'))).toBe('Menu Packages')
    expect(catalogLabel(getIndustryPack('florist'))).toBe('Service Packages')
    expect(catalogLabel(getIndustryPack('general'))).toBe('Packages')
  })
})

describe('compliance module', () => {
  it('is enabled for coffee-cart and not for general', () => {
    expect(resolveEnabledModules('coffee-cart')).toContain('compliance')
    expect(resolveEnabledModules('general')).not.toContain('compliance')
  })
})

describe('forms module', () => {
  it('is enabled for every built-in pack (the forms page is reachable by all orgs)', () => {
    for (const pack of getAllIndustryPacks()) {
      expect(pack.modules).toContain('forms')
    }
  })
})

describe('storefront module (drops)', () => {
  it('coffee-cart pack enables storefront', () => {
    expect(isModuleEnabled(getIndustryPack('coffee-cart'), 'storefront')).toBe(true)
  })
  it('general pack does not enable storefront yet', () => {
    expect(isModuleEnabled(getIndustryPack('general'), 'storefront')).toBe(false)
  })
  it('labels are vertical-skinned', () => {
    expect(storefrontLabel(getIndustryPack('coffee-cart'))).toBe('Drops')
    expect(storefrontLabel(getIndustryPack('general'))).toBe('Online orders')
  })
})
