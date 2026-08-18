'use server'

import { activityRef, logActivity } from '@/lib/activity'
import { assertOrgMember } from '@/lib/auth/assert'
import type { ActivityEvent } from '@/lib/types'

// Fire-and-forget contact log from the cockpit header (Email/Call). Records
// that the operator reached out, so the client list's freshness signal and the
// activity timeline both reflect the touch. assertOrgMember gates the write;
// logActivity bypasses rules via adminDb.
export async function logContactActivity(
  orgId: string,
  input: { parent_type: 'customer'; parent_id: string; kind: 'emailed' | 'called' }
): Promise<void> {
  await assertOrgMember(orgId)
  const summary = input.kind === 'emailed' ? 'Emailed' : 'Called'
  await logActivity(orgId, {
    parent_type: input.parent_type,
    parent_id: input.parent_id,
    kind: input.kind,
    summary,
  })
}

export async function listActivity(
  orgId: string,
  parentType: 'customer' | 'opportunity',
  parentId: string
): Promise<ActivityEvent[]> {
  await assertOrgMember(orgId)
  const snap = await activityRef(orgId)
    .where('parent_type', '==', parentType)
    .where('parent_id', '==', parentId)
    .orderBy('created_at', 'desc')
    .get()
  return snap.docs.map((d) => d.data() as ActivityEvent)
}
