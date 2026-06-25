import { NextRequest, NextResponse } from 'next/server'

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

export function isPlatformHost(host: string): boolean {
  const h = host.split(':')[0]
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`) || h === 'localhost' || h.endsWith('.vercel.app')
}

// For a custom (non-platform) host, only the root path maps to the host-resolved portal;
// all other paths pass through so org/registrant routes keep working on the custom domain.
export function portalRewritePath(host: string, pathname: string): string | null {
  if (isPlatformHost(host)) return null
  return pathname === '/' ? '/portal' : null
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
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

  const portalPath = portalRewritePath(hostname, request.nextUrl.pathname)
  if (portalPath) {
    const url = request.nextUrl.clone()
    url.pathname = portalPath
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
