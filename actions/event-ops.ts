'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  getOpsPlanCore, instantiateOpsPlanCore, updateOpsRequirementsCore,
  toggleListItemCore, completeChecklistStepCore, toggleDeadlineCore, acknowledgeReviewCore,
  type InstantiateOpsPlanInput,
} from '@/lib/ops/event-ops'
import { createIssueCore, resolveIssueCore, listIssuesCore } from '@/lib/ops/issues'
import {
  getCloseoutCore, saveActualsCore, closeoutSummaryCore, completeCloseoutCore,
} from '@/lib/ops/closeout'
import type { OpsPlan, OpsRequirements, OpsIssue, IssueSeverity, OpsCloseout, OpsActuals, CloseoutSummary } from '@/lib/types'

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

export async function listIssues(orgId: string, eventId: string): Promise<OpsIssue[]> {
  await assertOrgMember(orgId)
  return listIssuesCore(orgId, eventId)
}

export async function createIssue(
  orgId: string, eventId: string,
  input: { type: string; severity: IssueSeverity; note: string },
): Promise<OpsIssue> {
  const member = await assertOrgMember(orgId)
  return createIssueCore(orgId, eventId, { ...input, created_by: member.uid })
}

export async function resolveIssue(orgId: string, eventId: string, issueId: string, resolution?: string): Promise<void> {
  await assertOrgMember(orgId)
  return resolveIssueCore(orgId, eventId, issueId, resolution)
}

export async function getCloseout(orgId: string, eventId: string): Promise<OpsCloseout | null> {
  await assertOrgMember(orgId)
  return getCloseoutCore(orgId, eventId)
}

export async function saveActuals(orgId: string, eventId: string, actuals: OpsActuals): Promise<void> {
  await assertOrgMember(orgId)
  return saveActualsCore(orgId, eventId, actuals)
}

export async function getCloseoutSummary(orgId: string, eventId: string): Promise<CloseoutSummary> {
  await assertOrgMember(orgId)
  return closeoutSummaryCore(orgId, eventId)
}

export async function completeCloseout(orgId: string, eventId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return completeCloseoutCore(orgId, eventId)
}
