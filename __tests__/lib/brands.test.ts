// __tests__/lib/brands.test.ts
import { describe, it, expect } from 'vitest'
import {
  getBrand,
  getAllBrands,
  getBrandByHostname,
  validBrandParam,
  signupUrl,
  DEFAULT_BRAND_ID,
} from '@/lib/brands'

describe('getBrand', () => {
  it('returns the brand for a known id', () => {
    expect(getBrand('brewtrax').name).toBe('BrewTrax')
  })

  it('falls back to the default brand for unknown or absent ids', () => {
    expect(getBrand('nope').id).toBe(DEFAULT_BRAND_ID)
    expect(getBrand(undefined).id).toBe(DEFAULT_BRAND_ID)
  })
})

describe('getAllBrands', () => {
  it('includes the default and brewtrax brands', () => {
    const ids = getAllBrands().map((b) => b.id)
    expect(ids).toContain('traxevent')
    expect(ids).toContain('brewtrax')
  })

  it('every brand references a known shape', () => {
    for (const b of getAllBrands()) {
      expect(b.industryPackId).toBeTruthy()
      expect(b.marketing.headline).toBeTruthy()
      expect(b.theme.accent).toMatch(/^#/)
    }
  })
})

describe('getBrandByHostname', () => {
  it('matches a brand custom domain', () => {
    expect(getBrandByHostname('brewtrax.com')?.id).toBe('brewtrax')
    expect(getBrandByHostname('www.brewtrax.com')?.id).toBe('brewtrax')
  })

  it('strips the port before matching', () => {
    expect(getBrandByHostname('brewtrax.com:3000')?.id).toBe('brewtrax')
  })

  it('matches the {id}.localhost dev convention', () => {
    expect(getBrandByHostname('brewtrax.localhost:3000')?.id).toBe('brewtrax')
  })

  it('returns null for non-brand hosts (traxevent domains, org subdomains, localhost)', () => {
    expect(getBrandByHostname('traxevent.com')).toBeNull()
    expect(getBrandByHostname('fbc.traxevent.com')).toBeNull()
    expect(getBrandByHostname('localhost:3000')).toBeNull()
  })
})

describe('validBrandParam', () => {
  it('returns the id for a known non-default brand', () => {
    expect(validBrandParam('brewtrax')).toBe('brewtrax')
  })

  it('returns null for unknown, default, empty, or missing values', () => {
    expect(validBrandParam('nope')).toBeNull()
    expect(validBrandParam('traxevent')).toBeNull()
    expect(validBrandParam('')).toBeNull()
    expect(validBrandParam(null)).toBeNull()
    expect(validBrandParam(undefined)).toBeNull()
  })
})

describe('signupUrl', () => {
  it('links to the main-domain signup carrying the brand param', () => {
    expect(signupUrl('brewtrax')).toBe('https://traxevent.com/signup?brand=brewtrax')
  })
})
