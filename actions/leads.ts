'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES } from '@/lib/leads'
import { logActivity } from '@/lib/activity'
import { leadsRef, listLeadsCore, updateLeadCore, type LeadUpdate } from '@/lib/crm/leads'
import { randomBytes } from 'crypto'
import type { Lead, LeadStage } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// LeadUpdate (a type) is therefore NOT re-exported here; import it from
// '@/lib/crm/leads' directly. Re-exporting it broke `next build` (RSC compiler).

export interface CreateLeadInput {
  name: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string
  event_date?: string
  estimated_value?: number
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
  if (!input.name?.trim()) throw new Error('Name is required')
  const stage = input.stage ?? 'inquiry'
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  const id = randomBytes(8).toString('hex')
  const lead: Lead = {
    id,
    name: input.name.trim(),
    stage,
    created_at: new Date().toISOString(),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
    ...(input.event_type?.trim() ? { event_type: input.event_type.trim() } : {}),
    ...(input.event_date?.trim() ? { event_date: input.event_date.trim() } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await leadsRef(orgId).doc(id).set(lead)
  return lead
}

export async function updateLead(orgId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  let prevStage: LeadStage | undefined
  if (updates.stage) {
    const snap = await leadsRef(orgId).doc(leadId).get()
    prevStage = snap.exists ? (snap.data() as Lead).stage : undefined
  }
  await updateLeadCore(orgId, leadId, updates)
  if (updates.stage && updates.stage !== prevStage) {
    await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${updates.stage}` })
  }
}

export async function setLeadStage(orgId: string, leadId: string, stage: LeadStage): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  await leadsRef(orgId).doc(leadId).update({ stage, updated_at: new Date().toISOString() })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${stage}` })
}

export async function deleteLead(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).delete()
}
