import { adminDb } from '@/lib/firebase-admin'
import type { Org } from '@/lib/types'

/**
 * Resolve a public-profile handle to its org. Unknown handle and disabled
 * profile both return null so the public page can't leak which it was.
 * Equality query on a map field — automatic single-field index, no
 * firestore.indexes.json change.
 */
export async function getOrgByHandle(handle: string): Promise<Org | null> {
  const snap = await adminDb
    .collection('orgs')
    .where('public_profile.handle', '==', handle.trim().toLowerCase())
    .limit(1)
    .get()
  if (snap.empty) return null
  const org = { id: snap.docs[0].id, ...snap.docs[0].data() } as Org
  if (org.public_profile?.enabled !== true) return null
  return org
}
