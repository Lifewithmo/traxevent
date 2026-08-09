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
