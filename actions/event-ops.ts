'use server'

import { assertEventPage, assertOrgAdmin } from '@/lib/auth/assert'
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

// Event-scoped actions gate on assertEventPage(orgId, eventId, 'ops') rather
// than plain org membership, so per-event/per-department page grants apply
// to ops the same way they do to every other event page. instantiateOpsPlan
// and completeCloseout keep assertOrgAdmin instead: canAccessEventPage
// already grants owner/admin every page unconditionally
// (lib/auth/access.ts), so admin gates here are a strict superset, not a
// separate access path — plan creation and closing out the event stay
// admin-only actions on top of that.

export async function getOpsPlan(orgId: string, eventId: string): Promise<OpsPlan | null> {
  await assertEventPage(orgId, eventId, 'ops')
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
  const member = await assertEventPage(orgId, eventId, 'ops')
  return updateOpsRequirementsCore(orgId, eventId, updates, member.uid)
}

export async function toggleListItem(
  orgId: string, eventId: string,
  list: 'shopping_list' | 'packing_list', resourceId: string, checked: boolean, unit?: string,
): Promise<void> {
  await assertEventPage(orgId, eventId, 'ops')
  return toggleListItemCore(orgId, eventId, list, resourceId, checked, unit)
}

export async function completeChecklistStep(
  orgId: string, eventId: string,
  checklistId: string, stepIndex: number,
  input: { done: boolean; evidence_value?: string },
): Promise<void> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  return completeChecklistStepCore(orgId, eventId, checklistId, stepIndex, { ...input, actor_uid: member.uid })
}

export async function toggleDeadline(orgId: string, eventId: string, deadlineId: string, done: boolean): Promise<void> {
  await assertEventPage(orgId, eventId, 'ops')
  return toggleDeadlineCore(orgId, eventId, deadlineId, done)
}

export async function acknowledgeReview(orgId: string, eventId: string): Promise<void> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  return acknowledgeReviewCore(orgId, eventId, member.uid)
}

export async function listIssues(orgId: string, eventId: string): Promise<OpsIssue[]> {
  await assertEventPage(orgId, eventId, 'ops')
  return listIssuesCore(orgId, eventId)
}

export async function createIssue(
  orgId: string, eventId: string,
  input: { type: string; severity: IssueSeverity; note: string },
): Promise<OpsIssue> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  return createIssueCore(orgId, eventId, { ...input, created_by: member.uid })
}

export async function resolveIssue(orgId: string, eventId: string, issueId: string, resolution?: string): Promise<void> {
  await assertEventPage(orgId, eventId, 'ops')
  return resolveIssueCore(orgId, eventId, issueId, resolution)
}

export async function getCloseout(orgId: string, eventId: string): Promise<OpsCloseout | null> {
  await assertEventPage(orgId, eventId, 'ops')
  return getCloseoutCore(orgId, eventId)
}

export async function saveActuals(orgId: string, eventId: string, actuals: OpsActuals): Promise<void> {
  await assertEventPage(orgId, eventId, 'ops')
  return saveActualsCore(orgId, eventId, actuals)
}

export async function getCloseoutSummary(orgId: string, eventId: string): Promise<CloseoutSummary> {
  await assertEventPage(orgId, eventId, 'ops')
  return closeoutSummaryCore(orgId, eventId)
}

export async function completeCloseout(orgId: string, eventId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return completeCloseoutCore(orgId, eventId)
}
