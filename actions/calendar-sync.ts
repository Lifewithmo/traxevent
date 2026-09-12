'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin, assertOrgMember } from '@/lib/auth/assert'
import { generateAccessToken } from '@/lib/tokens'

/**
 * The org's ICS feed token, minting one on first use. Idempotent, so any
 * member opening the subscribe panel may call it; rotating is admin-only.
 */
export async function ensureIcsToken(orgId: string): Promise<string> {
  await assertOrgMember(orgId)
  const ref = adminDb.collection('orgs').doc(orgId)
  const snap = await ref.get()
  const existing = snap.data()?.ics_token as string | undefined
  if (existing) return existing
  const token = generateAccessToken()
  await ref.update({ ics_token: token })
  return token
}

/** Rotate the feed token; every previously shared URL stops working. */
export async function regenerateIcsToken(orgId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const token = generateAccessToken()
  await adminDb.collection('orgs').doc(orgId).update({ ics_token: token })
  return token
}

// The subscribe panel is handed the built feed URL and nothing else, so slug —
// not orgId — is the only identifier it can act on. Not exported: a 'use server'
// module may only export async functions, and this is an internal lookup.
async function orgIdForSlug(orgSlug: string): Promise<string | null> {
  const snap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
}

/**
 * May the caller rotate this org's feed token? Owner/admin only, via the same
 * assertOrgAdmin guard that actually enforces it — this only decides whether the
 * control is drawn. Deliberately non-throwing: a member who cannot rotate should
 * see no button, not an error.
 */
export async function canRotateIcsToken(orgSlug: string): Promise<boolean> {
  try {
    const orgId = await orgIdForSlug(orgSlug)
    if (!orgId) return false
    await assertOrgAdmin(orgId)
    return true
  } catch {
    return false
  }
}

/** Rotate by slug, for the subscribe panel. Enforcement stays in regenerateIcsToken. */
export async function rotateIcsToken(orgSlug: string): Promise<string> {
  const orgId = await orgIdForSlug(orgSlug)
  if (!orgId) throw new Error('Not found')
  return regenerateIcsToken(orgId)
}
