import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { adminAuth } from '@/lib/firebase-admin'

export const SESSION_COOKIE = 'tx_session'
// 5 days, in seconds (cookie maxAge). createSessionCookie wants milliseconds.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5

export interface CurrentUser {
  uid: string
  orgId?: string
  orgSlug?: string
  role?: string
}

// Mint a session cookie value from a fresh Firebase ID token.
export async function createSessionCookieValue(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
}

/**
 * Read + verify the session cookie. Returns null if absent or invalid.
 *
 * Memoised per REQUEST with React `cache()` — the pattern Next's own auth guide
 * prescribes for a DAL session check. One cockpit render calls this ~5 times
 * (every `assertOrgMember` / `requireOrgMember` on the route), and each call was
 * a separate `verifySessionCookie(…, true)` — a revocation-checked Auth RPC, not
 * a local JWT decode. Memoising collapses them to one per request.
 *
 * Safe to memoise because this is structurally request-scoped: it awaits
 * `cookies()`, which throws outside a request. Every caller is inside one
 * (lib/auth/assert.ts, lib/auth/guards.ts, lib/auth/family-access.ts,
 * actions/registrations.ts) — no script, no cron, no `revalidate` route calls
 * it. The one place the cookie is WRITTEN (app/api/auth/session/route.ts) never
 * reads the user back in the same request, so there is no set-then-read
 * staleness hazard. Outside a request scope React's `cache()` degrades to a
 * plain pass-through, so nothing silently shares an identity across requests.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const cookie = store.get(SESSION_COOKIE)
  if (!cookie?.value) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie.value, true)
    return {
      uid: decoded.uid,
      orgId: decoded.orgId as string | undefined,
      orgSlug: decoded.orgSlug as string | undefined,
      role: decoded.role as string | undefined,
    }
  } catch {
    return null
  }
})
