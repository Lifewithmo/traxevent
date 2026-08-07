import type { Org, Lead, Task } from '@/lib/types'
import type { CreateCustomerInput } from '@/lib/crm/customers'

/**
 * Records are cross-referenced by LOGICAL KEY (`'cust-harper'`), not document
 * id. Customers and invoices get their real ids from core helpers that mint
 * their own (`findOrCreateCustomerCore`, `createInvoiceCore`), so the pure
 * builder cannot know them. The writer keeps a key -> id map as it inserts.
 *
 * Leads and events are written directly, so they carry stable literal ids —
 * which keeps demo URLs identical across resets.
 */

export interface SeedCustomer {
  key: string
  input: CreateCustomerInput
}

export interface SeedLead {
  key: string
  customerKey: string
  /** `customer_id` is filled by the writer from the key map. */
  lead: Omit<Lead, 'customer_id'>
}

export interface SeedTask {
  leadKey: string
  /** `lead_id` is filled by the writer. */
  task: Omit<Task, 'lead_id'>
}

export interface BrewtraxSeed {
  /** `id` comes from --org-id at write time. */
  org: Omit<Org, 'id'>
  customers: SeedCustomer[]
  leads: SeedLead[]
  tasks: SeedTask[]
}
