import { describe, it, expect } from 'vitest'
import {
  getIndustryPack,
  getAllIndustryPacks,
  isModuleEnabled,
  resolveEnabledModules,
  DEFAULT_INDUSTRY_PACK_ID,
} from '@/lib/industry-packs'

const ALL_MODULES = [
  'leads', 'clients', 'proposals', 'contracts', 'invoices',
  'events', 'registrants', 'vendors', 'calendar', 'reports',
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
})
