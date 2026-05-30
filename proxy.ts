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

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const orgSlug = extractOrgSlug(hostname)

  if (!orgSlug) return NextResponse.next()

  const url = request.nextUrl.clone()
  // Rewrite: /{path} → /{orgSlug}/{path} so the [orgSlug] route segment is populated
  if (!url.pathname.startsWith(`/${orgSlug}`)) {
    url.pathname = `/${orgSlug}${url.pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
