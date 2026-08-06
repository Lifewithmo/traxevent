'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listComplianceDocsCore, createComplianceDocCore, updateComplianceDocCore, deleteComplianceDocCore,
  type CreateComplianceDocInput, type ComplianceDocUpdate,
} from '@/lib/ops/compliance'
import type { ComplianceDoc } from '@/lib/types'

export async function listComplianceDocs(orgId: string): Promise<ComplianceDoc[]> {
  await assertOrgMember(orgId)
  return listComplianceDocsCore(orgId)
}

export async function createComplianceDoc(orgId: string, input: CreateComplianceDocInput): Promise<ComplianceDoc> {
  await assertOrgAdmin(orgId)
  return createComplianceDocCore(orgId, input)
}

export async function updateComplianceDoc(orgId: string, docId: string, updates: ComplianceDocUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateComplianceDocCore(orgId, docId, updates)
}

export async function deleteComplianceDoc(orgId: string, docId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return deleteComplianceDocCore(orgId, docId)
}
