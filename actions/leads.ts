'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES, closedAtPatch, LOST_REASON_LABELS } from '@/lib/leads'
import { logActivity } from '@/lib/activity'
import { createLeadCore, leadsRef, listLeadsCore, updateLeadCore, type LeadUpdate } from '@/lib/crm/leads'
import { findOrCreateCustomerCore, getCustomerCore } from '@/lib/crm/customers'
import { convertOpportunityToWorkCore, type ConvertToWorkInput } from '@/lib/crm/convert'
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
  const contact = input.customer_id
    ? {
        name: customer.name,
        ...(customer.email ? { email: customer.email } : {}),
        ...(customer.phone ? { phone: customer.phone } : {}),
        ...(customer.company ? { organization: customer.company } : {}),
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
    await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${updates.stage}` })
  }
}

export async function setLeadStage(orgId: string, leadId: string, stage: LeadStage): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  const snap = await leadsRef(orgId).doc(leadId).get()
  const prevStage = snap.exists ? (snap.data() as Lead).stage : undefined
  await updateLeadCore(orgId, leadId, {
    stage,
    ...(prevStage ? closedAtPatch(prevStage, stage, new Date().toISOString()) : {}),
  })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${stage}` })
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
