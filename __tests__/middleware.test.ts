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

  it('rewrites a brand-domain marketing path into the brand tree', () => {
    const request = new NextRequest('https://brewtrax.com/pricing', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/brand/brewtrax/pricing')
  })

  it('rewrites a nested brand-domain marketing path into the brand tree', () => {
    const request = new NextRequest('https://brewtrax.com/vs/hotplate', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/brand/brewtrax/vs/hotplate')
  })

  it('does not double-prefix a path that already starts with /brand/', () => {
    const request = new NextRequest('https://brewtrax.com/brand/brewtrax/pricing', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('leaves API paths on brand domains untouched', () => {
    const request = new NextRequest('https://brewtrax.com/api/signup', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('leaves static asset paths with a file extension untouched', () => {
    const request = new NextRequest('https://brewtrax.com/robots.txt', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('non-brand host behavior is unchanged (org subdomain still rewrites to /{orgSlug}/...)', () => {
    const request = new NextRequest('https://fbc.traxevent.com/summer', {
      headers: { host: 'fbc.traxevent.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/fbc/summer')
  })
})
