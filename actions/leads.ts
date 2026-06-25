'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

function leadsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

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
  const snap = await leadsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
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

export interface LeadUpdate {
  name?: string
  email?: string | null
  phone?: string | null
  organization?: string | null
  event_type?: string | null
  event_date?: string | null
  estimated_value?: number | null
  stage?: LeadStage
  notes?: string | null
}

export async function updateLead(
  orgId: string,
  leadId: string,
  updates: LeadUpdate
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.stage && !LEAD_STAGES.includes(updates.stage)) throw new Error('Invalid stage')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await leadsRef(orgId).doc(leadId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function setLeadStage(orgId: string, leadId: string, stage: LeadStage): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  await leadsRef(orgId).doc(leadId).update({ stage, updated_at: new Date().toISOString() })
}

export async function deleteLead(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).delete()
}
