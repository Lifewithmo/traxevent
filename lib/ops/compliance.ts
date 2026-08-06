import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { ComplianceDoc } from '@/lib/types'

export interface CreateComplianceDocInput {
  name: string
  expires_on?: string
  link_url?: string
  notes?: string
}

export interface ComplianceDocUpdate {
  name?: string
  expires_on?: string | null
  link_url?: string | null
  notes?: string | null
}

export function complianceDocsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('compliance_docs')
}

export async function listComplianceDocsCore(orgId: string): Promise<ComplianceDoc[]> {
  const snap = await complianceDocsRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as ComplianceDoc)
}

/** Guard-free create. Validates name; performs no auth. */
export async function createComplianceDocCore(orgId: string, input: CreateComplianceDocInput): Promise<ComplianceDoc> {
  if (!input.name?.trim()) throw new Error('Name is required')
  const ref = complianceDocsRef(orgId).doc()
  const doc: ComplianceDoc = {
    id: ref.id,
    name: input.name.trim(),
    ...(input.expires_on !== undefined ? { expires_on: input.expires_on } : {}),
    ...(input.link_url !== undefined ? { link_url: input.link_url } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: new Date().toISOString(),
  }
  await ref.set(doc)
  return doc
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateComplianceDocCore(orgId: string, docId: string, updates: ComplianceDocUpdate): Promise<void> {
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await complianceDocsRef(orgId).doc(docId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteComplianceDocCore(orgId: string, docId: string): Promise<void> {
  await complianceDocsRef(orgId).doc(docId).delete()
}

/** Pure. Docs whose expiry falls on or before `byDate` (YYYY-MM-DD). No-expiry docs never match. */
export function expiringDocs(docs: ComplianceDoc[], byDate: string): ComplianceDoc[] {
  return docs.filter((d) => d.expires_on !== undefined && d.expires_on <= byDate)
}
