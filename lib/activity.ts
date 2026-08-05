import 'server-only'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import type { ActivityEvent } from '@/lib/types'

export function activityRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('activity')
}

// Internal helper invoked by already-authorized server actions (they gate on
// assertOrgAdmin/assertOrgMember before calling this). Not a public entry point.
export async function logActivity(
  orgId: string,
  e: {
    parent_type: ActivityEvent['parent_type']
    parent_id: string
    kind: ActivityEvent['kind']
    summary: string
  }
): Promise<void> {
  const id = randomBytes(8).toString('hex')
  const created_at = new Date().toISOString()
  try {
    await activityRef(orgId).doc(id).set({ id, created_at, ...e })
  } catch (err) {
    // Best-effort telemetry: the caller's real business write has already
    // committed by the time logActivity runs, so a failure here must never
    // bubble up and fail an already-successful mutation.
    console.error('logActivity failed', err)
  }
}
