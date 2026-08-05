import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import type { Customer } from '@/lib/types'

export interface CreateCustomerInput {
  name: string
  company?: string
  email?: string
  phone?: string
  tags?: string[]
  notes?: string
}

export function customersRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('customers')
}

/** Guard-free customer create. Authorization is the caller's responsibility. */
export async function createCustomerCore(orgId: string, input: CreateCustomerInput): Promise<Customer> {
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
