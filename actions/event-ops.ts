'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  getOpsPlanCore, instantiateOpsPlanCore, updateOpsRequirementsCore,
  toggleListItemCore, completeChecklistStepCore, toggleDeadlineCore, acknowledgeReviewCore,
  type InstantiateOpsPlanInput,
} from '@/lib/ops/event-ops'
import type { OpsPlan, OpsRequirements } from '@/lib/types'

// NOTE: 'use server' module — InstantiateOpsPlanInput is imported for typing
// this file's exports only and is NOT re-exported; import it from
// '@/lib/ops/event-ops' where it's needed elsewhere (see actions/customers.ts
// for the precedent — re-exporting types from a 'use server' file broke
// `next build`'s RSC compiler).

export async function getOpsPlan(orgId: string, eventId: string): Promise<OpsPlan | null> {
  await assertOrgMember(orgId)
  return getOpsPlanCore(orgId, eventId)
}

export async function instantiateOpsPlan(
  orgId: string,
  eventId: string,
  input: Omit<InstantiateOpsPlanInput, 'actor_uid'>,
): Promise<OpsPlan> {
  const member = await assertOrgAdmin(orgId)
  return instantiateOpsPlanCore(orgId, eventId, { ...input, actor_uid: member.uid })
}

export async function updateOpsRequirements(
  orgId: string,
  eventId: string,
  updates: Partial<OpsRequirements>,
): Promise<void> {
  const member = await assertOrgMember(orgId)
  return updateOpsRequirementsCore(orgId, eventId, updates, member.uid)
}

export async function toggleListItem(
  orgId: string, eventId: string,
  list: 'shopping_list' | 'packing_list', resourceId: string, checked: boolean,
): Promise<void> {
  await assertOrgMember(orgId)
  return toggleListItemCore(orgId, eventId, list, resourceId, checked)
}

export async function completeChecklistStep(
  orgId: string, eventId: string,
  checklistId: string, stepIndex: number,
  input: { done: boolean; evidence_value?: string },
): Promise<void> {
  const member = await assertOrgMember(orgId)
  return completeChecklistStepCore(orgId, eventId, checklistId, stepIndex, { ...input, actor_uid: member.uid })
}

export async function toggleDeadline(orgId: string, eventId: string, deadlineId: string, done: boolean): Promise<void> {
  await assertOrgMember(orgId)
  return toggleDeadlineCore(orgId, eventId, deadlineId, done)
}

export async function acknowledgeReview(orgId: string, eventId: string): Promise<void> {
  const member = await assertOrgMember(orgId)
  return acknowledgeReviewCore(orgId, eventId, member.uid)
}
