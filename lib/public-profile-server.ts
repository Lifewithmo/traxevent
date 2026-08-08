import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { isValidHandle } from '@/lib/public-profile'
import type { Org } from '@/lib/types'

/**
 * Resolve a public-profile handle to its org. Unknown handle and disabled
 * profile both return null so the public page can't leak which it was.
 * Equality query on a map field — automatic single-field index, no
 * firestore.indexes.json change.
 * Per-request memoization via React cache() — dedupes multiple calls within
 * a single page render (e.g., generateMetadata + component both resolve the
 * same handle).
 * This is the only unauthenticated Firestore-backed route in the app, so
 * malformed handles (crawler noise, bots probing paths) are rejected before
 * the query — all stored handles satisfy HANDLE_RE by construction, so this
 * pre-check never rejects a legitimate handle.
 */
export const getOrgByHandle = cache(
  async (handle: string): Promise<Org | null> => {
    const normalized = handle.trim().toLowerCase()
    if (!isValidHandle(normalized)) return null
    const snap = await adminDb
      .collection('orgs')
      .where('public_profile.handle', '==', normalized)
      .limit(1)
      .get()
    if (snap.empty) return null
    const org = { id: snap.docs[0].id, ...snap.docs[0].data() } as Org
    if (org.public_profile?.enabled !== true) return null
    return org
  }
)
