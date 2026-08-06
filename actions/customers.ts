'use server'

import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { createCustomerCore, customersRef, normalizeEmail, type CreateCustomerInput } from '@/lib/crm/customers'
import { listLeadsByCustomerCore } from '@/lib/crm/leads'
import type { Customer, Lead } from '@/lib/types'

// NOTE: 'use server' module — every export must be an async function. The
// CreateCustomerInput type is therefore NOT re-exported here; import it from
// '@/lib/crm/customers'. Re-exporting it broke `next build` (RSC compiler).
// The Lead type is likewise imported only for signatures, never re-exported.

export async function listCustomers(orgId: string): Promise<Customer[]> {
  await assertOrgMember(orgId)
  const snap = await customersRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Customer)
}

export async function getCustomer(orgId: string, customerId: string): Promise<Customer | null> {
  await assertOrgMember(orgId)
  const snap = await customersRef(orgId).doc(customerId).get()
  return snap.exists ? (snap.data() as Customer) : null
}

export async function listCustomerOpportunities(orgId: string, customerId: string): Promise<Lead[]> {
  await assertOrgMember(orgId)
  return listLeadsByCustomerCore(orgId, customerId)
}

export async function createCustomer(orgId: string, input: CreateCustomerInput): Promise<Customer> {
  await assertOrgAdmin(orgId)
  return createCustomerCore(orgId, input)
}

export interface CustomerUpdate {
  name?: string
  company?: string | null
  email?: string | null
  phone?: string | null
  tags?: string[] | null
  notes?: string | null
}

export async function updateCustomer(orgId: string, customerId: string, updates: CustomerUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  if (updates.email !== undefined) {
    const key = updates.email === null ? null : normalizeEmail(updates.email)
    cleaned.email_lower = key === null || key === undefined ? FieldValue.delete() : key
  }
  await customersRef(orgId).doc(customerId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
