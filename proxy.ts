import { NextRequest, NextResponse } from 'next/server'
import { getBrandByHostname } from '@/lib/brands'

const ROOT_DOMAIN = 'traxevent.com'
const RESERVED = new Set(['www', 'app', 'api'])

export function extractOrgSlug(hostname: string): string | null {
  // Strip port if present
  const host = hostname.split(':')[0]
  if (host === ROOT_DOMAIN) return null
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null
  const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1)
  if (RESERVED.has(sub)) return null
  return sub
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // Brand acquisition domains (brewtrax.com, …): serve marketing pages from
  // the /brand/{brandId} tree. `/` maps to the brand landing page; other
  // marketing paths are rewritten 1:1 into the same tree. App/infra paths
  // (/api, already-namespaced /brand/..., static assets) pass through.
  const brand = getBrandByHostname(hostname)
  if (brand) {
    const { pathname } = request.nextUrl
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = `/brand/${brand.id}`
      return NextResponse.rewrite(url)
    }
    // Pass through app/infra paths and already-namespaced paths untouched.
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname)
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith(`/brand/`) ||
      hasFileExtension
    ) {
      return NextResponse.next()
    }
    const url = request.nextUrl.clone()
    url.pathname = `/brand/${brand.id}${pathname}`
    return NextResponse.rewrite(url)
  }

  const orgSlug = extractOrgSlug(hostname)

  if (orgSlug) {
    const url = request.nextUrl.clone()
    // Rewrite: /{path} → /{orgSlug}/{path} so the [orgSlug] route segment is populated
    if (!url.pathname.startsWith(`/${orgSlug}`)) {
      url.pathname = `/${orgSlug}${url.pathname}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
