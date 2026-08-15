import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { extractOrgSlug, proxy } from '@/proxy'

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

describe('proxy', () => {
  it('rewrites a platform org subdomain path to /{orgSlug}/...', () => {
    const request = new NextRequest('https://fbc.traxevent.com/summer/register', {
      headers: { host: 'fbc.traxevent.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/fbc/summer/register')
  })
})

describe('proxy — brand domains', () => {
  it('rewrites the brand domain root to the brand landing route', () => {
    const request = new NextRequest('https://brewtrax.com/', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/brand/brewtrax')
  })

  it('leaves non-root paths on brand domains untouched', () => {
    const request = new NextRequest('https://brewtrax.com/signup', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })
})
