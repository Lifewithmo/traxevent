import { describe, it, expect } from 'vitest'
import { extractOrgSlug } from '@/proxy'

describe('extractOrgSlug', () => {
  it('returns slug from subdomain on traxevent.com', () => {
    expect(extractOrgSlug('firsthills.traxevent.com')).toBe('firsthills')
  })

  it('returns null for the apex domain', () => {
    expect(extractOrgSlug('traxevent.com')).toBeNull()
  })

  it('returns null for www subdomain', () => {
    expect(extractOrgSlug('www.traxevent.com')).toBeNull()
  })

  it('returns null for localhost', () => {
    expect(extractOrgSlug('localhost:3000')).toBeNull()
  })

  it('returns null for reserved subdomains', () => {
    expect(extractOrgSlug('app.traxevent.com')).toBeNull()
    expect(extractOrgSlug('api.traxevent.com')).toBeNull()
  })
})
