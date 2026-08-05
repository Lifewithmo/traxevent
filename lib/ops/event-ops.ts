import { adminDb } from '@/lib/firebase-admin'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { getTemplatesForOrg } from '@/lib/ops/checklist-templates'
import {
  computeShoppingList, computePackingList, deriveDeadlines, instantiateChecklists,
} from '@/lib/ops/derive'
import type { OpsPlan, OpsRequirements, OpsChangeEntry } from '@/lib/types'

export function opsPlanRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('ops').doc('plan')
}

export async function getOpsPlanCore(orgId: string, eventId: string): Promise<OpsPlan | null> {
  const snap = await opsPlanRef(orgId, eventId).get()
  return snap.exists ? (snap.data() as OpsPlan) : null
}

export interface InstantiateOpsPlanInput {
  package_ids: string[]
  requirements: OpsRequirements
  event_start: string          // ISO date of the event (deadline anchor)
  industry_pack_id?: string
  actor_uid: string
}

/**
 * The chain, in one call (spec §3.3): packages + requirements → lists,
 * deadlines, checklist instances. This is the seam the proposals
 * "convert-to-work" increment calls after acceptance.
 */
export async function instantiateOpsPlanCore(
  orgId: string,
  eventId: string,
  input: InstantiateOpsPlanInput,
): Promise<OpsPlan> {
  if (input.requirements.guests <= 0) throw new Error('Guest count must be positive')
  const packages = await getWorkPackagesByIdsCore(orgId, input.package_ids)
  const found = new Set(packages.map((p) => p.id))
  for (const id of input.package_ids) {
    if (!found.has(id)) throw new Error(`Unknown package: ${id}`)
  }
  const resources = await listResourcesCore(orgId)
  const templates = await getTemplatesForOrg(orgId, input.industry_pack_id)

  const now = new Date().toISOString()
  const plan: OpsPlan = {
    package_ids: input.package_ids,
    requirements: input.requirements,
    deadlines: deriveDeadlines(input.event_start, input.industry_pack_id),
    shopping_list: computeShoppingList(packages, resources, input.requirements.guests),
    packing_list: computePackingList(packages, resources),
    checklists: instantiateChecklists(templates),
    needs_review: false,
    change_log: [{ at: now, by: input.actor_uid, field: 'instantiated' }],
    ...(input.industry_pack_id !== undefined ? { industry_pack_id: input.industry_pack_id } : {}),
    created_at: now,
  }
  await opsPlanRef(orgId, eventId).set(plan)
  return plan
}

async function loadPlan(orgId: string, eventId: string): Promise<OpsPlan> {
  const snap = await opsPlanRef(orgId, eventId).get()
  if (!snap.exists) throw new Error('No ops plan for this event')
  return snap.data() as OpsPlan
}

const QUANTITY_FIELDS = new Set<keyof OpsRequirements>(['guests'])

/**
 * Requirement changes propagate but never silently (spec §3.3): every change
 * is logged; quantity changes re-derive the lists AND set needs_review.
 * NOTE: re-derived lists reset `checked` state — flagged via needs_review so
 * the operator re-verifies. Deadlines are anchored to the event date, which
 * lives on the Event doc — date changes are out of scope here.
 */
export async function updateOpsRequirementsCore(
  orgId: string,
  eventId: string,
  updates: Partial<OpsRequirements>,
  actorUid: string,
): Promise<void> {
  if (updates.guests !== undefined && updates.guests <= 0) throw new Error('Guest count must be positive')
  const plan = await loadPlan(orgId, eventId)

  const now = new Date().toISOString()
  const entries: OpsChangeEntry[] = []
  let reDerive = false
  for (const [field, value] of Object.entries(updates)) {
    if (value === undefined) continue
    const prev = plan.requirements[field as keyof OpsRequirements]
    if (JSON.stringify(prev) === JSON.stringify(value)) continue
    entries.push({
      at: now, by: actorUid, field,
      ...(prev !== undefined ? { from: JSON.stringify(prev).replace(/^"|"$/g, '') } : {}),
      to: JSON.stringify(value).replace(/^"|"$/g, ''),
    })
    if (QUANTITY_FIELDS.has(field as keyof OpsRequirements)) reDerive = true
  }
  if (entries.length === 0) return

  const payload: Record<string, unknown> = {
    change_log: [...plan.change_log, ...entries],
    updated_at: now,
  }
  for (const [field, value] of Object.entries(updates)) {
    if (value === undefined) continue
    payload[`requirements.${field}`] = value
  }
  if (reDerive) {
    const guests = updates.guests ?? plan.requirements.guests
    const packages = await getWorkPackagesByIdsCore(orgId, plan.package_ids)
    const resources = await listResourcesCore(orgId)
    payload.shopping_list = computeShoppingList(packages, resources, guests)
    payload.packing_list = computePackingList(packages, resources)
    payload.needs_review = true
  }
  await opsPlanRef(orgId, eventId).update(payload)
}

export async function toggleListItemCore(
  orgId: string,
  eventId: string,
  list: 'shopping_list' | 'packing_list',
  resourceId: string,
  checked: boolean,
): Promise<void> {
  const plan = await loadPlan(orgId, eventId)
  const items = plan[list]
  const idx = items.findIndex((i) => i.resource_id === resourceId)
  if (idx === -1) throw new Error('Item not found')
  const next = items.map((i, n) => (n === idx ? { ...i, checked } : i))
  await opsPlanRef(orgId, eventId).update({ [list]: next, updated_at: new Date().toISOString() })
}

export async function completeChecklistStepCore(
  orgId: string,
  eventId: string,
  checklistId: string,
  stepIndex: number,
  input: { done: boolean; evidence_value?: string; actor_uid: string },
): Promise<void> {
  const plan = await loadPlan(orgId, eventId)
  const clIdx = plan.checklists.findIndex((c) => c.id === checklistId)
  if (clIdx === -1) throw new Error('Checklist not found')
  const checklist = plan.checklists[clIdx]
  if (stepIndex < 0 || stepIndex >= checklist.steps.length) throw new Error('Step not found')

  const steps = checklist.steps.map((s, n) => {
    if (n !== stepIndex) return s
    if (!input.done) {
      // un-complete: strip completion metadata entirely
      return { text: s.text, evidence: s.evidence, done: false }
    }
    return {
      text: s.text, evidence: s.evidence, done: true,
      done_at: new Date().toISOString(),
      done_by: input.actor_uid,
      ...(input.evidence_value !== undefined ? { evidence_value: input.evidence_value } : {}),
    }
  })
  const checklists = plan.checklists.map((c, n) => (n === clIdx ? { ...c, steps } : c))
  await opsPlanRef(orgId, eventId).update({ checklists, updated_at: new Date().toISOString() })
}

export async function toggleDeadlineCore(
  orgId: string,
  eventId: string,
  deadlineId: string,
  done: boolean,
): Promise<void> {
  const plan = await loadPlan(orgId, eventId)
  const idx = plan.deadlines.findIndex((d) => d.id === deadlineId)
  if (idx === -1) throw new Error('Deadline not found')
  const deadlines = plan.deadlines.map((d, n) => (n === idx ? { ...d, done } : d))
  await opsPlanRef(orgId, eventId).update({ deadlines, updated_at: new Date().toISOString() })
}

export async function acknowledgeReviewCore(orgId: string, eventId: string, actorUid: string): Promise<void> {
  const plan = await loadPlan(orgId, eventId)
  const now = new Date().toISOString()
  await opsPlanRef(orgId, eventId).update({
    needs_review: false,
    change_log: [...plan.change_log, { at: now, by: actorUid, field: 'review_acknowledged' }],
    updated_at: now,
  })
}
