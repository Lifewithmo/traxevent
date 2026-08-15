import { NextRequest, NextResponse } from 'next/server'
import { getBrandByHostname } from '@/lib/brands'
import { PATHNAME_HEADER } from '@/lib/sidebar-nav'

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

// Server components cannot read the request path. Forwarding it lets layouts
// skip per-route work they know the current page will not render (see the org
// layout's sidebar event list). Post-rewrite path, so it matches the segments
// the route actually receives.
function withPathname(request: NextRequest, pathname: string) {
  const headers = new Headers(request.headers)
  headers.set(PATHNAME_HEADER, pathname)
  return { request: { headers } }
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // Brand acquisition domains (brewtrax.com, …): serve the brand landing at /.
  // Everything else on a brand domain falls through to normal routes.
  const brand = getBrandByHostname(hostname)
  if (brand) {
    if (request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = `/brand/${brand.id}`
      return NextResponse.rewrite(url, withPathname(request, url.pathname))
    }
    return NextResponse.next(withPathname(request, request.nextUrl.pathname))
  }

  const orgSlug = extractOrgSlug(hostname)

  if (orgSlug) {
    const url = request.nextUrl.clone()
    // Rewrite: /{path} → /{orgSlug}/{path} so the [orgSlug] route segment is populated
    if (!url.pathname.startsWith(`/${orgSlug}`)) {
      url.pathname = `/${orgSlug}${url.pathname}`
      return NextResponse.rewrite(url, withPathname(request, url.pathname))
    }
    return NextResponse.next(withPathname(request, url.pathname))
  }

  return NextResponse.next(withPathname(request, request.nextUrl.pathname))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
