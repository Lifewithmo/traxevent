import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { LEAD_STAGES } from '@/lib/leads'
import type { Lead, LeadStage, LeadWaiting } from '@/lib/types'

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
}

export function leadsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

export async function listLeadsCore(orgId: string): Promise<Lead[]> {
  const snap = await leadsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
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
