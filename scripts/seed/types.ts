import type { Org, Lead, Task, Event, ItineraryItem, Proposal, OpsRequirements, ResourceKind, IssueSeverity } from '@/lib/types'
import type { CreateCustomerInput } from '@/lib/crm/customers'
import type { CreateInvoiceCoreInput, RecordPaymentCoreInput } from '@/lib/crm/invoices'
import type { CreateComplianceDocInput } from '@/lib/ops/compliance'

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

export interface SeedEvent {
  key: string
  event: Event
  itinerary: ItineraryItem[]
}

export interface SeedProposal {
  leadKey: string
  /** `org_id`, `lead_id`, and `token` are filled by the writer. */
  proposal: Omit<Proposal, 'org_id' | 'lead_id' | 'token'>
}

export interface SeedInvoice {
  key: string
  leadKey: string
  customerKey: string
  input: CreateInvoiceCoreInput
  /** Present = issue it after create. Absent = leave it in draft. */
  issue?: { issuedAt: string }
  payments: RecordPaymentCoreInput[]
}

/** Work package lines reference resources by logical key; the writer swaps in real ids. */
export type SeedWorkPackageLine =
  | { kind: 'consumable'; resourceKey: string; qty_per_guest: number; base_qty?: number }
  | { kind: 'equipment'; resourceKey: string; qty: number }
  | { kind: 'labor'; role: string; count: number }

export interface SeedWorkPackage {
  key: string
  name: string
  description?: string
  scope?: string
  price: number
  max_guests?: number
  lines: SeedWorkPackageLine[]
  setup_minutes?: number
  teardown_minutes?: number
}

export interface SeedResource {
  key: string
  input: { name: string; kind: ResourceKind; unit?: string; unit_cost?: number; notes?: string }
}

export interface SeedIssue {
  type: string
  severity: IssueSeverity
  note: string
  /** Present = resolve it after create. */
  resolution?: string
}

export interface SeedOps {
  resources: SeedResource[]
  workPackages: SeedWorkPackage[]
  plan: {
    eventKey: string
    packageKeys: string[]
    requirements: OpsRequirements
    /** How many checklist steps to mark done, and how many deadlines, so
     *  readiness reads as in-progress rather than 0% or 100%. */
    completeStepCount: number
    completeDeadlineCount: number
  }
  issues: SeedIssue[]
  complianceDocs: CreateComplianceDocInput[]
}

export interface BrewtraxSeed {
  /** `id` comes from --org-id at write time. */
  org: Omit<Org, 'id'>
  customers: SeedCustomer[]
  leads: SeedLead[]
  tasks: SeedTask[]
  events: SeedEvent[]
  proposals: SeedProposal[]
  invoices: SeedInvoice[]
  ops: SeedOps
}
