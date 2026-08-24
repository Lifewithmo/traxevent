'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertEventPage, assertOrgAdmin } from '@/lib/auth/assert'
import {
  getOpsPlanCore, instantiateOpsPlanCore, updateOpsRequirementsCore,
  toggleListItemCore, bulkSetListCheckedCore, recomputeOpsListsCore,
  completeChecklistStepCore, toggleDeadlineCore, acknowledgeReviewCore,
  confirmReadyCore,
  type InstantiateOpsPlanInput,
} from '@/lib/ops/event-ops'
import { listItineraryCore } from '@/lib/itinerary-data'
import { formatTime, groupItineraryByDay } from '@/lib/itinerary'
import { formatEventDateRange } from '@/lib/event-ui'
import {
  resolveAnchorTime,
  backPlanFromAnchor,
  RUN_SHEET_CHECKLIST_PHASES,
} from '@/app/(admin)/[orgSlug]/[eventSlug]/ops/runsheet/anchor'
import { sendRunSheetEmail } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Event, Org } from '@/lib/types'
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

/** Load-out "check all" — one transaction for the whole group, not N toggles. */
export async function bulkSetListChecked(
  orgId: string, eventId: string,
  list: 'shopping_list' | 'packing_list', checked: boolean,
  keys?: { resource_id: string; unit?: string }[],
): Promise<void> {
  await assertEventPage(orgId, eventId, 'ops')
  return bulkSetListCheckedCore(orgId, eventId, list, checked, keys)
}

/** Load-out Recompute — unconditional re-derive from current packages/resources
 *  (spec 2026-08-19 B5). Returns the fresh plan so the client can swap state. */
export async function recomputeOpsLists(
  orgId: string, eventId: string,
  opts?: { guests?: number },
): Promise<OpsPlan> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  return recomputeOpsListsCore(orgId, eventId, member.uid, opts)
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

/** Operator attestation "this job is ready" (inc-2 P2). Returns the stamp so
 *  the client can render the confirmed state without a re-read. */
export async function confirmReady(orgId: string, eventId: string): Promise<{ at: string; by: string }> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  return confirmReadyCore(orgId, eventId, member.uid)
}

/**
 * Self-send v1 of the run sheet (inc-2 S3.3) — dead-zone insurance beyond the
 * open tab. Recipient is ALWAYS the caller's own member email (no recipient UX
 * yet; staff fan-out is a named deferral). The content is fully INLINE —
 * timeline, contacts, site needs, load status, anchor + back-plan — because a
 * link back to the admin surface hits the auth wall from a phone mail client;
 * the live-sheet link is included but the email must stand alone.
 *
 * Sending IS the action (nudge.ts precedent): a rejected send throws to the
 * operator — nothing here may report "sent" for mail that never left.
 */
export async function sendRunSheet(orgId: string, eventId: string): Promise<{ to: string }> {
  const member = await assertEventPage(orgId, eventId, 'ops')
  if (!member.email) throw new Error('Your member profile has no email address')

  const [eventSnap, orgSnap, plan, itineraryItems] = await Promise.all([
    adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).get(),
    adminDb.collection('orgs').doc(orgId).get(),
    getOpsPlanCore(orgId, eventId),
    listItineraryCore(orgId, eventId),
  ])
  if (!eventSnap.exists) throw new Error('Event not found')
  const event = eventSnap.data() as Event
  const org = orgSnap.data() as Org | undefined

  let fromDomain: string | undefined
  try {
    fromDomain = await getVerifiedSendingDomain(orgId)
  } catch {
    // domain lookup failure must not block the send — fall back to the default
  }

  const itinerary = groupItineraryByDay(itineraryItems)
  const anchor = resolveAnchorTime({
    serviceStart: plan?.requirements.service_start,
    hoursStart: event.hours?.start,
    itinerary,
  })
  const buffers = org?.ops_buffers
  const loadoutItems = plan ? [...plan.shopping_list, ...plan.packing_list] : []
  const checklists = (plan?.checklists ?? [])
    .filter((c) => (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).includes(c.phase))

  await sendRunSheetEmail({
    to: member.email,
    eventName: event.name,
    dateLabel: formatEventDateRange(event.event_start, event.event_end),
    anchor: anchor ? { label: anchor.label, display: anchor.display } : null,
    backPlan: anchor ? backPlanFromAnchor(anchor.hhmm, buffers) : null,
    buffers,
    venue: event.location ?? null,
    contacts: event.key_contacts ?? [],
    siteNeeds: plan?.requirements.site_needs ?? [],
    // Pre-formatted for the email body (the email module renders, never derives).
    itinerary: itinerary.map((day) => ({
      day: formatEventDateRange(day.day),
      items: day.items.map((i) => ({
        start_time: formatTime(i.start_time),
        title: i.title,
        ...(i.location ? { location: i.location } : {}),
      })),
    })),
    checklists: checklists.map((c) => ({
      name: c.name,
      done: c.steps.filter((s) => s.done).length,
      total: c.steps.length,
    })),
    loadout: plan ? { checked: loadoutItems.filter((i) => i.checked).length, total: loadoutItems.length } : null,
    orgSlug: org?.slug ?? '',
    eventSlug: event.slug,
    fromDisplayName: org?.branding?.display_name ?? org?.name,
    fromDomain,
  })
  return { to: member.email }
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
