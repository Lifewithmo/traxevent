import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { LEAD_STAGES } from '@/lib/leads'
import type { Lead, LeadStage, LeadWaiting, LostReason } from '@/lib/types'
import { randomBytes } from 'crypto'

export interface LeadUpdate {
  name?: string
  title?: string | null
  email?: string | null
  phone?: string | null
  organization?: string | null
  event_type?: string | null
  event_date?: string | null
  estimated_value?: number | null
  stage?: LeadStage
  notes?: string | null
  customer_id?: string | null
  waiting?: LeadWaiting | null
  guest_count?: number | null
  closed_at?: string | null
  lost?: { reason: LostReason; note?: string } | null
  delivery_mode?: 'offsite' | 'onsite'
}

export function leadsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

export async function listLeadsCore(orgId: string): Promise<Lead[]> {
  const snap = await leadsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
}

export async function listLeadsByCustomerCore(orgId: string, customerId: string): Promise<Lead[]> {
  const snap = await leadsRef(orgId).where('customer_id', '==', customerId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
}

export interface CreateLeadCoreInput {
  name: string
  stage: LeadStage
  customer_id: string
  title?: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string
  event_date?: string
  estimated_value?: number
  guest_count?: number
  notes?: string
  source?: 'intake' | 'manual'
  delivery_mode?: 'offsite' | 'onsite'
}

/** Guard-free lead create. Validates name/stage; performs no auth, no customer
 *  dedup, and logs no activity — those are the caller's responsibility. */
export async function createLeadCore(orgId: string, input: CreateLeadCoreInput): Promise<Lead> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!LEAD_STAGES.includes(input.stage)) throw new Error('Invalid stage')
  const id = randomBytes(8).toString('hex')
  const lead: Lead = {
    id,
    name: input.name.trim(),
    stage: input.stage,
    created_at: new Date().toISOString(),
    customer_id: input.customer_id,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
    ...(input.event_type?.trim() ? { event_type: input.event_type.trim() } : {}),
    ...(input.event_date?.trim() ? { event_date: input.event_date.trim() } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.guest_count != null ? { guest_count: input.guest_count } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.delivery_mode ? { delivery_mode: input.delivery_mode } : {}),
  }
  await leadsRef(orgId).doc(id).set(lead)
  return lead
}

/** Guard-free lead update. Validates stage; performs no auth and logs no activity. */
export async function updateLeadCore(orgId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  if (updates.stage && !LEAD_STAGES.includes(updates.stage)) throw new Error('Invalid stage')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await leadsRef(orgId).doc(leadId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
