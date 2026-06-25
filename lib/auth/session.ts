import 'server-only'

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
  networkId?: string
  networkSlug?: string
  networkRole?: string
}

// Mint a session cookie value from a fresh Firebase ID token.
export async function createSessionCookieValue(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
}

// Read + verify the session cookie. Returns null if absent or invalid.
export async function getCurrentUser(): Promise<CurrentUser | null> {
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
      networkId: decoded.networkId as string | undefined,
      networkSlug: decoded.networkSlug as string | undefined,
      networkRole: decoded.networkRole as string | undefined,
    }
  } catch {
    return null
  }
}
