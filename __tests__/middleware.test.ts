import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { extractOrgSlug, isPlatformHost, portalRewritePath, proxy } from '@/proxy'

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

describe('isPlatformHost', () => {
  it('returns true for the apex domain', () => {
    expect(isPlatformHost('traxevent.com')).toBe(true)
  })

  it('returns true for a traxevent.com subdomain', () => {
    expect(isPlatformHost('fbc.traxevent.com')).toBe(true)
  })

  it('returns true for localhost with a port', () => {
    expect(isPlatformHost('localhost:3000')).toBe(true)
  })

  it('returns true for a vercel.app preview host', () => {
    expect(isPlatformHost('foo.vercel.app')).toBe(true)
  })

  it('returns false for a custom domain', () => {
    expect(isPlatformHost('camps.denomination.org')).toBe(false)
  })
})

describe('portalRewritePath', () => {
  it('rewrites the root path to /portal for a custom host', () => {
    expect(portalRewritePath('camps.denomination.org', '/')).toBe('/portal')
  })

  it('returns null for a non-root path on a custom host', () => {
    expect(portalRewritePath('camps.denomination.org', '/fbc/summer/register')).toBeNull()
  })

  it('returns null for a platform host', () => {
    expect(portalRewritePath('traxevent.com', '/')).toBeNull()
    expect(portalRewritePath('fbc.traxevent.com', '/')).toBeNull()
  })
})

describe('proxy', () => {
  it('rewrites a platform org subdomain path to /{orgSlug}/...', () => {
    const request = new NextRequest('https://fbc.traxevent.com/summer/register', {
      headers: { host: 'fbc.traxevent.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/fbc/summer/register')
  })

  it('rewrites a custom host root path to /portal', () => {
    const request = new NextRequest('https://camps.denomination.org/', {
      headers: { host: 'camps.denomination.org' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/portal')
  })

  it('passes through a custom host non-root path', () => {
    const request = new NextRequest('https://camps.denomination.org/fbc/summer/register', {
      headers: { host: 'camps.denomination.org' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })
})
