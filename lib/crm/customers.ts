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

/** Pure construction of a new Customer record (id + timestamp + present optional fields). No I/O. */
function buildCustomer(input: CreateCustomerInput): Customer {
  if (!input.name?.trim()) throw new Error('Name is required')
  const id = randomBytes(8).toString('hex')
  return {
    id,
    name: input.name.trim(),
    created_at: new Date().toISOString(),
    ...(input.company?.trim() ? { company: input.company.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim(), email_lower: normalizeEmail(input.email) } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
}

/** Guard-free customer create. Authorization is the caller's responsibility. */
export async function createCustomerCore(orgId: string, input: CreateCustomerInput): Promise<Customer> {
  const customer = buildCustomer(input)
  await customersRef(orgId).doc(customer.id).set(customer)
  return customer
}

/**
 * Find a customer by normalized email, or create one, atomically. Returns
 * `created: false` when an existing record was reused, `created: true` only when
 * a document was actually written. The lookup query and the create are performed
 * inside a single Firestore transaction so two concurrent calls for the same email
 * cannot both miss the lookup and both create a customer — a real risk once this
 * feeds a public, retry-prone intake form (see Task 7).
 *
 * Without an email there is nothing durable to dedup on, so a new customer is
 * always created directly, with no transaction (there's no read to race with).
 */
export async function findOrCreateCustomerCore(
  orgId: string,
  input: CreateCustomerInput
): Promise<{ customer: Customer; created: boolean }> {
  const key = normalizeEmail(input.email)
  if (!key) {
    return { customer: await createCustomerCore(orgId, input), created: true }
  }

  const query = customersRef(orgId).where('email_lower', '==', key).limit(1)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(query)
    if (!snap.empty) return { customer: snap.docs[0].data() as Customer, created: false }

    const customer = buildCustomer(input)
    tx.set(customersRef(orgId).doc(customer.id), customer)
    return { customer, created: true }
  })
}
