'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES, closedAtPatch, LOST_REASON_LABELS } from '@/lib/leads'
import { logActivity } from '@/lib/activity'
import { createLeadCore, leadsRef, listLeadsCore, updateLeadCore, type LeadUpdate } from '@/lib/crm/leads'
import { findOrCreateCustomerCore, getCustomerCore } from '@/lib/crm/customers'
import { convertOpportunityToWorkCore, type ConvertToWorkInput } from '@/lib/crm/convert'
import { getOrg } from '@/actions/orgs'
import { listCapacityUnitsCore } from '@/lib/capacity/units'
import { hasMultiResourceCapacity, computeCapacity } from '@/lib/capacity/capacity'
import { leadRequirement } from '@/lib/capacity/requirement'
import { kindLabel } from '@/lib/capacity/labels'
import type { StageChangeResult } from '@/lib/capacity/guard'
import type { Lead, LeadStage, LeadWaiting, LostReason, Event, Customer } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// LeadUpdate (a type) is therefore NOT re-exported here; import it from
// '@/lib/crm/leads' directly. Re-exporting it broke `next build` (RSC compiler).

export interface CreateLeadInput {
  name?: string          // required unless customer_id is present
  customer_id?: string   // link to an existing customer; contact snapshot is copied from it
  title?: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string
  event_date?: string
  estimated_value?: number
  guest_count?: number
  stage?: LeadStage
  notes?: string
  delivery_mode?: 'offsite' | 'onsite'
  assigned_units?: Lead['assigned_units']
}

export async function listLeads(orgId: string): Promise<Lead[]> {
  await assertOrgMember(orgId)
  return listLeadsCore(orgId)
}

export async function getLead(orgId: string, leadId: string): Promise<Lead | null> {
  await assertOrgMember(orgId)
  const snap = await leadsRef(orgId).doc(leadId).get()
  return snap.exists ? (snap.data() as Lead) : null
}

export async function createLead(orgId: string, input: CreateLeadInput): Promise<Lead> {
  await assertOrgAdmin(orgId)
  const stage = input.stage ?? 'inquiry'
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')

  let customer: Customer
  if (input.customer_id) {
    const found = await getCustomerCore(orgId, input.customer_id)
    if (!found) throw new Error('Customer not found')
    customer = found
  } else {
    if (!input.name?.trim()) throw new Error('Name is required')
    customer = (await findOrCreateCustomerCore(orgId, {
      name: input.name.trim(),
      ...(input.organization?.trim() ? { company: input.organization.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    })).customer
  }

  // Linked mode snapshots contact fields from the customer record; unlinked keeps the typed values.
  // Organization is per-event: an explicit input.organization (even blank) overrides the snapshot
  // on the lead without touching the customer record.
  const linkedOrganization =
    input.organization !== undefined ? input.organization.trim() : customer.company
  const contact = input.customer_id
    ? {
        name: customer.name,
        ...(customer.email ? { email: customer.email } : {}),
        ...(customer.phone ? { phone: customer.phone } : {}),
        ...(linkedOrganization ? { organization: linkedOrganization } : {}),
      }
    : {
        name: input.name!.trim(),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
        ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
      }

  return createLeadCore(orgId, {
    ...contact,
    stage,
    customer_id: customer.id,
    source: 'manual',
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.event_type !== undefined ? { event_type: input.event_type } : {}),
    ...(input.event_date !== undefined ? { event_date: input.event_date } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.guest_count != null ? { guest_count: input.guest_count } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.delivery_mode !== undefined ? { delivery_mode: input.delivery_mode } : {}),
    ...(input.assigned_units !== undefined ? { assigned_units: input.assigned_units } : {}),
  })
}

export async function updateLead(orgId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  let prevStage: LeadStage | undefined
  if (updates.stage) {
    const snap = await leadsRef(orgId).doc(leadId).get()
    prevStage = snap.exists ? (snap.data() as Lead).stage : undefined
  }
  await updateLeadCore(orgId, leadId, {
    ...updates,
    ...(updates.stage && prevStage ? closedAtPatch(prevStage, updates.stage, new Date().toISOString()) : {}),
  })
  if (updates.stage && updates.stage !== prevStage) {
    await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${updates.stage}`, stage: updates.stage })
  }
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** UTC-safe "Aug 30, 2026" for a `YYYY-MM-DD` string; echoes the input if malformed. */
function guardDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const month = MONTH_ABBR[m - 1]
  if (month === undefined || !Number.isFinite(d) || !Number.isFinite(y)) return ymd
  return `${month} ${d}, ${y}`
}

/**
 * The capacity guard's confirm copy, or null when winning `lead` is clear.
 *
 * Fires only for a business-tier org with ≥1 unit and a dated lead. Simulates
 * this lead as won, then rejects if its date goes over capacity OR its assigned
 * unit double-books — the same `computeCapacity`/clash math the radar shows, so
 * the server and the UI agree. Advisory-with-override: the caller passes
 * `{ override: true }` to skip this entirely (a deliberate "yes, book both").
 */
async function capacityGuardMessage(orgId: string, lead: Lead): Promise<string | null> {
  if (!lead.event_date) return null
  const org = await getOrg(orgId)
  if (!org || !hasMultiResourceCapacity(org)) return null
  const units = await listCapacityUnitsCore(orgId)
  if (units.length === 0) return null

  const leads = await listLeadsCore(orgId)
  // Simulate this lead as won on top of the live pipeline (it may still carry its
  // pre-win stage in the loaded list). If it wasn't in the list at all, add it.
  let found = false
  const simulated = leads.map((l) => {
    if (l.id !== lead.id) return l
    found = true
    return { ...l, stage: 'closed_won' as LeadStage }
  })
  if (!found) simulated.push({ ...lead, stage: 'closed_won' })

  const day = computeCapacity(simulated, units, [lead.event_date], org).get(lead.event_date)
  if (!day) return null

  const date = guardDate(lead.event_date)

  // Clash is the more specific, actionable conflict — name the unit(s) THIS
  // lead's booking double-books (only kinds its requirement actually consumes).
  const req = leadRequirement(lead, org)
  const au = lead.assigned_units
  const ownedClashes = day.clashes.filter((c) =>
    (c.kind === 'mobile' && req.mobile && au?.mobile === c.unitId) ||
    (c.kind === 'venue' && req.venue && au?.venue === c.unitId)
  )
  if (ownedClashes.length > 0) {
    const names = ownedClashes.map((c) => c.unitName).join(' & ')
    return `${names} is already booked on ${date}. Book this one too?`
  }

  const overKind = day.detail.find((d) => d.demand > d.supply)
  if (overKind) {
    const label = kindLabel(org, overKind.kind, overKind.demand)
    return `${date} is over capacity — ${overKind.demand} ${label} needed but only ${overKind.supply} available. Book this one too?`
  }

  return null
}

export async function setLeadStage(
  orgId: string,
  leadId: string,
  stage: LeadStage,
  opts?: { override?: boolean }
): Promise<StageChangeResult> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  const snap = await leadsRef(orgId).doc(leadId).get()
  const lead = snap.exists ? (snap.data() as Lead) : undefined
  const prevStage = lead?.stage

  // Capacity guard: only on a transition INTO closed_won (from a non-won stage),
  // and only when the operator has NOT already chosen to override. Advisory —
  // supersedes the Inc-2 client-side pre-confirm.
  //
  // RETURNED, never thrown (see lib/capacity/guard.ts): Next redacts thrown
  // Server Action errors in production, so a thrown guard could not be detected
  // on the client in a real build and degraded into a hard block. A refusal is
  // a return value; the client confirms `guard` and re-calls with
  // { override: true }. A genuine error (invalid stage above, or a Firestore
  // write failure below) still throws.
  if (stage === 'closed_won' && prevStage !== 'closed_won' && !opts?.override && lead) {
    const guard = await capacityGuardMessage(orgId, { ...lead, id: leadId })
    if (guard) return { ok: false, guard }
  }

  await updateLeadCore(orgId, leadId, {
    stage,
    ...(prevStage ? closedAtPatch(prevStage, stage, new Date().toISOString()) : {}),
  })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${stage}`, stage })
  return { ok: true }
}

export async function markLeadLost(
  orgId: string,
  leadId: string,
  input: { reason: LostReason; note?: string }
): Promise<void> {
  await assertOrgAdmin(orgId)
  const lead = await getLead(orgId, leadId)
  if (!lead) throw new Error('Lead not found')
  const note = input.note?.trim()
  await updateLeadCore(orgId, leadId, {
    stage: 'closed_lost',
    lost: { reason: input.reason, ...(note ? { note } : {}) },
    ...closedAtPatch(lead.stage, 'closed_lost', new Date().toISOString()),
  })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'lost',
    summary: `Lost — ${LOST_REASON_LABELS[input.reason]}${note ? ` · ${note}` : ''}`,
  })
}

export async function deleteLead(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).delete()
}

export async function setLeadWaiting(
  orgId: string,
  leadId: string,
  input: { reason: string; follow_up_date?: string }
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!input.reason?.trim()) throw new Error('A reason is required')
  const waiting: LeadWaiting = {
    reason: input.reason.trim(),
    ...(input.follow_up_date?.trim() ? { follow_up_date: input.follow_up_date.trim() } : {}),
  }
  await updateLeadCore(orgId, leadId, { waiting })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: `Waiting: ${waiting.reason}`,
  })
}

export async function clearLeadWaiting(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await updateLeadCore(orgId, leadId, { waiting: null })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: 'Resumed — cleared waiting',
  })
}

export async function convertOpportunityToWork(
  orgId: string,
  leadId: string,
  input: ConvertToWorkInput
): Promise<Event> {
  await assertOrgAdmin(orgId)
  const event = await convertOpportunityToWorkCore(orgId, leadId, input)
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'converted',
    summary: `Scheduled as ${event.name}`,
  })
  return event
}
