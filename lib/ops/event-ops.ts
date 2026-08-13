import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
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
 *
 * Idempotency contract: this throws 'Ops plan already exists for this
 * event' if a plan doc already exists for (orgId, eventId) — it never
 * silently overwrites one. Callers (e.g. proposals convert-to-work) MUST
 * call getOpsPlanCore first and skip instantiation when a plan already
 * exists, or catch this error and treat it as "already instantiated."
 * `event_start` should come from the Event doc's `event_start` field;
 * `industry_pack_id` from the org's selected pack (Org.industry_pack_id).
 */
export async function instantiateOpsPlanCore(
  orgId: string,
  eventId: string,
  input: InstantiateOpsPlanInput,
): Promise<OpsPlan> {
  if (!Number.isFinite(input.requirements.guests) || input.requirements.guests <= 0) throw new Error('Guest count must be positive')
  const ref = opsPlanRef(orgId, eventId)
  const existing = await ref.get()
  if (existing.exists) throw new Error('Ops plan already exists for this event')

  const packages = await getWorkPackagesByIdsCore(orgId, input.package_ids)
  const found = new Set(packages.map((p) => p.id))
  for (const id of input.package_ids) {
    if (!found.has(id)) throw new Error(`Unknown package: ${id}`)
  }
  const resources = await listResourcesCore(orgId)
  const templates = await getTemplatesForOrg(orgId, input.industry_pack_id)

  // Honor WorkPackage.checklist_template_ids: if any selected package names
  // specific templates, instantiate only the union of those (still sourced
  // from getTemplatesForOrg, so built-in ids like 'bi-cc-prep' are
  // attachable). No package opts in → fall back to the full template set.
  const templateIdUnion = new Set<string>()
  for (const p of packages) {
    for (const tid of p.checklist_template_ids ?? []) templateIdUnion.add(tid)
  }
  const selectedTemplates = templateIdUnion.size > 0
    ? templates.filter((t) => templateIdUnion.has(t.id))
    : templates

  // Strip undefined-valued keys so Firestore never receives `undefined`.
  const requirements = Object.fromEntries(
    Object.entries(input.requirements).filter(([, v]) => v !== undefined),
  ) as OpsRequirements

  const now = new Date().toISOString()
  const plan: OpsPlan = {
    package_ids: input.package_ids,
    requirements,
    deadlines: deriveDeadlines(input.event_start, input.industry_pack_id),
    shopping_list: computeShoppingList(packages, resources, requirements.guests),
    packing_list: computePackingList(packages, resources),
    checklists: instantiateChecklists(selectedTemplates),
    needs_review: false,
    change_log: [{ at: now, by: input.actor_uid, field: 'instantiated' }],
    ...(input.industry_pack_id !== undefined ? { industry_pack_id: input.industry_pack_id } : {}),
    created_at: now,
  }
  await ref.set(plan)
  return plan
}

const QUANTITY_FIELDS = new Set<keyof OpsRequirements>(['guests'])
const REQUIREMENT_FIELDS = new Set<keyof OpsRequirements>(['guests', 'service_start', 'service_end', 'site_needs', 'notes'])

/**
 * Requirement changes propagate but never silently (spec §3.3): every change
 * is logged; quantity changes re-derive the shopping list AND set
 * needs_review. NOTE: re-derivation preserves each item's `checked` state by
 * resource_id where possible — flagged via needs_review so the operator
 * still re-verifies. The packing list does NOT depend on guest count, so it
 * is left untouched (never recomputed here). Deadlines are anchored to the
 * event date, which lives on the Event doc — date changes are out of scope
 * here. Wrapped in a transaction so two staff editing requirements at once
 * can't clobber each other's change_log entries or list state.
 */
export async function updateOpsRequirementsCore(
  orgId: string,
  eventId: string,
  updates: Partial<OpsRequirements>,
  actorUid: string,
): Promise<void> {
  for (const field of Object.keys(updates)) {
    if (!REQUIREMENT_FIELDS.has(field as keyof OpsRequirements)) {
      throw new Error(`Unknown requirement field: ${field}`)
    }
  }
  if (updates.guests !== undefined && (!Number.isFinite(updates.guests) || updates.guests <= 0)) throw new Error('Guest count must be positive')

  const ref = opsPlanRef(orgId, eventId)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('No ops plan for this event')
    const plan = snap.data() as OpsPlan

    const now = new Date().toISOString()
    const entries: OpsChangeEntry[] = []
    let reDerive = false
    const payload: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(updates)) {
      if (value === undefined) continue
      payload[`requirements.${field}`] = value
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

    payload.change_log = FieldValue.arrayUnion(...entries)
    payload.updated_at = now

    if (reDerive) {
      const guests = updates.guests ?? plan.requirements.guests
      const packages = await getWorkPackagesByIdsCore(orgId, plan.package_ids)
      const foundIds = new Set(packages.map((p) => p.id))
      for (const id of plan.package_ids) {
        if (!foundIds.has(id)) throw new Error(`Package no longer exists: ${id}`)
      }
      const resources = await listResourcesCore(orgId)
      const prevChecked = new Map(plan.shopping_list.map((i) => [`${i.resource_id}|${i.unit ?? ''}`, i.checked]))
      payload.shopping_list = computeShoppingList(packages, resources, guests)
        .map((i) => ({ ...i, checked: prevChecked.get(`${i.resource_id}|${i.unit ?? ''}`) ?? false }))
      // packing_list intentionally omitted: it doesn't depend on guests.
      payload.needs_review = true
    }
    tx.update(ref, payload)
  })
}

/**
 * `unit` disambiguates the rare case where a resource has two list items with
 * the same resource_id but different units (e.g. one converted item plus one
 * needs_conversion item for the same resource — spec 2026-08-13 §4.3 finding).
 * Optional so pre-units callers/tests matching by resource_id alone still work.
 */
export async function toggleListItemCore(
  orgId: string,
  eventId: string,
  list: 'shopping_list' | 'packing_list',
  resourceId: string,
  checked: boolean,
  unit?: string,
): Promise<void> {
  const ref = opsPlanRef(orgId, eventId)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('No ops plan for this event')
    const plan = snap.data() as OpsPlan
    const items = plan[list]
    const idx = items.findIndex((i) => i.resource_id === resourceId && (i.unit ?? null) === (unit ?? null))
    if (idx === -1) throw new Error('Item not found')
    const next = items.map((i, n) => (n === idx ? { ...i, checked } : i))
    tx.update(ref, { [list]: next, updated_at: new Date().toISOString() })
  })
}

export async function completeChecklistStepCore(
  orgId: string,
  eventId: string,
  checklistId: string,
  stepIndex: number,
  input: { done: boolean; evidence_value?: string; actor_uid: string },
): Promise<void> {
  const ref = opsPlanRef(orgId, eventId)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('No ops plan for this event')
    const plan = snap.data() as OpsPlan
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
    tx.update(ref, { checklists, updated_at: new Date().toISOString() })
  })
}

export async function toggleDeadlineCore(
  orgId: string,
  eventId: string,
  deadlineId: string,
  done: boolean,
): Promise<void> {
  const ref = opsPlanRef(orgId, eventId)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('No ops plan for this event')
    const plan = snap.data() as OpsPlan
    const idx = plan.deadlines.findIndex((d) => d.id === deadlineId)
    if (idx === -1) throw new Error('Deadline not found')
    const deadlines = plan.deadlines.map((d, n) => (n === idx ? { ...d, done } : d))
    tx.update(ref, { deadlines, updated_at: new Date().toISOString() })
  })
}

export async function acknowledgeReviewCore(orgId: string, eventId: string, actorUid: string): Promise<void> {
  const ref = opsPlanRef(orgId, eventId)
  const now = new Date().toISOString()
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('No ops plan for this event')
    tx.update(ref, {
      needs_review: false,
      change_log: FieldValue.arrayUnion({ at: now, by: actorUid, field: 'review_acknowledged' }),
      updated_at: now,
    })
  })
}
