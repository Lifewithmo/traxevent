'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import type { Customer } from '@/lib/types'

function customersRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('customers')
}

export interface CreateCustomerInput {
  name: string
  company?: string
  email?: string
  phone?: string
  tags?: string[]
  notes?: string
}

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

export async function createCustomer(orgId: string, input: CreateCustomerInput): Promise<Customer> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('Name is required')
  const id = randomBytes(8).toString('hex')
  const customer: Customer = {
    id,
    name: input.name.trim(),
    created_at: new Date().toISOString(),
    ...(input.company?.trim() ? { company: input.company.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await customersRef(orgId).doc(id).set(customer)
  return customer
}

export interface CustomerUpdate {
  name?: string
  company?: string | null
  email?: string | null
  phone?: string | null
  tags?: string[] | null
  notes?: string | null
}

export async function updateCustomer(
  orgId: string,
  customerId: string,
  updates: CustomerUpdate
): Promise<void> {
  await assertOrgAdmin(orgId)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await customersRef(orgId).doc(customerId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
