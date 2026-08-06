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

/** Lowercased, trimmed email — the durable dedup key. Undefined when there is no usable email. */
export function normalizeEmail(email?: string): string | undefined {
  const e = email?.trim().toLowerCase()
  return e ? e : undefined
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
    ...(input.email?.trim() ? { email: input.email.trim(), email_lower: normalizeEmail(input.email) } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await customersRef(orgId).doc(id).set(customer)
  return customer
}

/**
 * Find a customer by normalized email, or create one. Returns `created: false`
 * when an existing record was reused. Without an email there is nothing durable
 * to dedup on, so a new customer is always created.
 */
export async function findOrCreateCustomerCore(
  orgId: string,
  input: CreateCustomerInput
): Promise<{ customer: Customer; created: boolean }> {
  const key = normalizeEmail(input.email)
  if (key) {
    const snap = await customersRef(orgId).where('email_lower', '==', key).limit(1).get()
    if (!snap.empty) return { customer: snap.docs[0].data() as Customer, created: false }
  }
  return { customer: await createCustomerCore(orgId, input), created: true }
}
