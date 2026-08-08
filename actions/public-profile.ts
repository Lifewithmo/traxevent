'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { parsePublicProfile } from '@/lib/public-profile'
import type { PublicProfile } from '@/lib/types'

/**
 * Full-overwrite save (delete path included), like updateOrgBranding — but in
 * a transaction whose first read is the handle-uniqueness query, closing the
 * check-then-set race between two orgs claiming the same handle.
 */
export async function savePublicProfile(orgId: string, input: unknown): Promise<PublicProfile> {
  await assertOrgAdmin(orgId)
  const profile = parsePublicProfile(input)
  await adminDb.runTransaction(async (tx) => {
    const conflict = await tx.get(
      adminDb.collection('orgs').where('public_profile.handle', '==', profile.handle).limit(1),
    )
    if (!conflict.empty && conflict.docs[0].id !== orgId) throw new Error('That URL is taken.')
    tx.update(adminDb.collection('orgs').doc(orgId), { public_profile: profile })
  })
  return profile
}
