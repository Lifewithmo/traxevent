'use server'

import { activityRef } from '@/lib/activity'
import { assertOrgMember } from '@/lib/auth/assert'
import type { ActivityEvent } from '@/lib/types'

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
