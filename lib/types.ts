import type { Terminology } from '@/lib/event-types'

export type OrgRole = 'owner' | 'admin' | 'staff'

export type EventRegistrationType = 'family' | 'individual' | 'child'

export type BillingPlan = 'standard' | 'business'

export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
  plan?: BillingPlan
  industry_pack_id?: string          // selected industry pack; absent = 'general'
  brand_id?: string                  // acquisition brand the org signed up through; absent = 'traxevent'
  stripe_customer_id?: string
  stripe_account_id?: string
  sending_domain?: string
  sending_domain_id?: string
  sending_domain_status?: SendingDomainStatus
  sending_domain_records?: DomainDnsRecord[]
  tips_enabled?: boolean
  ics_token?: string                 // secret path segment of the read-only calendar feed
  branding?: OrgBranding
  public_profile?: PublicProfile
  intake_token?: string              // public intake form access token; minted lazily (actions/intake.ts)
  ai_voice_note?: string              // optional "How we sound" style note fed to AI drafting
  default_proposal_terms?: string    // seeded into new proposals' `terms` (snapshot, not a live reference)
  created_at: string
}

// Brand kit (proposal builder redesign spec §2). All fields are public-safe
// by construction — this object is shipped verbatim to public proposal pages.
export interface OrgBranding {
  display_name?: string        // customer-facing; falls back to org name
  address?: string             // customer-facing business address (multi-line); shown on invoices
  logo_url?: string
  cover_image_url?: string     // hero behind the proposal title
  accent_color?: string        // #rrggbb
  secondary_color?: string     // #rrggbb
}

// Public profile / link-in-bio (public profile page spec). Like OrgBranding,
// the whole map is public-safe by construction — it ships verbatim to /p/[handle].
export interface PublicProfileLink {
  id: string                   // client-minted uuid; stable identity for list editing
  title: string
  url: string
  description?: string
  image_url?: string
}

export interface PublicProfileSocials {
  instagram?: string
  tiktok?: string
  youtube?: string
  facebook?: string
  website?: string
}

export interface PublicProfile {
  enabled: boolean             // page 404s unless true
  handle: string               // unique across orgs; /p/[handle]
  display_name?: string        // falls back to branding.display_name → org name
  bio?: string
  photo_url?: string
  socials?: PublicProfileSocials
  links: PublicProfileLink[]
}

export const EVENT_PAGES = [
  'dashboard',
  'families',
  'assignments',
  'teams',
  'budget',
  'itinerary',
  'communicate',
  'forms',
  'people',
  'checkin',
  'reports',
  'ops',
] as const

export type EventPage = typeof EVENT_PAGES[number]

export interface OrgMember {
  uid: string
  role: OrgRole
  display_name: string
  email: string
  event_access: Record<string, { pages: EventPage[] }>
  department_access?: Record<string, { pages: EventPage[] }>  // per-department grants, inherited by that dept's events
}

export interface OrgInvitation {
  token: string
  email: string
  role: OrgRole
  created_at: string
  expires_at: string
  accepted_at?: string
}

export interface Event {
  id: string
  name: string
  slug: string
  year: number
  status: 'draft' | 'active' | 'archived'
  registration_type: EventRegistrationType
  event_type_id: string              // drives terminology + UI config
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  event_start: string
  event_end: string
  registration_open?: string         // ISO date, optional
  registration_close?: string        // ISO date, optional
  capacity?: number                  // max registrants, optional
  headcount?: number                 // booked-job path: expected guest count (no per-person roster)
  lead_id?: string                   // the opportunity this job came from; absent for manual events
  key_contacts?: EventKeyContact[]   // booked-job path: a few contacts instead of an attendee roster
  created_at: string
  updated_at?: string                // set on every updateEvent call
  payment_amount?: number            // registration fee in dollars (e.g. 150 = $150.00); omit or 0 for free events
  from_display_name?: string  // display name in email "from" field, e.g. "Summer Camp 2026 at First Baptist"
  reply_to_email?: string     // reply-to address; replies route to this address instead of TraxEvent
  itinerary_published?: boolean
  event_type_terminology?: Terminology
  department_id?: string | null   // optional grouping; null/undefined = unassigned
}

export interface EventKeyContact {
  name: string
  role: string
  phone?: string
  email?: string
}

// Shape of our Firebase Auth JWT custom claims
export interface AuthClaims {
  orgId: string
  orgSlug: string
  role: OrgRole | 'platform_admin'
}

export interface RegistrantProfile {
  uid: string
  display_name: string
  email: string
  phone: string
  address: {
    street: string
    city: string
    state: string
    zip: string
  }
  emergency_contact: {
    name: string
    phone: string
    relationship: string
  }
  saved_members: SavedFamilyMember[]
  created_at: string
  updated_at: string
}

export interface SavedFamilyMember {
  id: string
  first_name: string
  last_name: string
  birth_year: number
  gender: string
}

export interface Family {
  id: string
  org_id: string
  event_id: string
  org_slug: string
  event_slug: string
  event_name: string
  org_name: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: { street: string; city: string; state: string; zip: string }
  emergency_contact: { name: string; phone: string; relationship: string }
  registration_status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled'
  payment_status: 'unpaid' | 'paid' | 'partial' | 'waived'
  registrant_uid: string | null
  pco_household_id: string | null
  access_token: string | null
  access_token_expires_at: string | null
  created_at: string
  updated_at: string
  assignment_slot_id?: string | null  // null = explicitly unassigned; undefined = never set
  // Admin-managed fields (not present at registration time)
  amount_due?: number
  amount_paid?: number
  payment_notes?: string
  notes?: FamilyNote[]
}

export interface FamilyMember {
  id: string
  family_id: string
  first_name: string
  last_name: string
  birth_year: number
  gender: string
  grade: string
  allergies: string
  dietary_restrictions: string
  tshirt_size: string
  medical_notes: string
}

export interface FamilyNote {
  id: string
  text: string
  author: string
  created_at: string
  type: 'admin' | 'system'
}

export interface FamilyCsvRow {
  familyName: string
  email: string
  phone: string
  campers: string
  status: string
  balance: string
  submitted: string
}

export interface CommunicationLogEntry {
  id: string
  subject: string
  html_body: string
  filter: 'all' | 'confirmed' | 'pending' | 'waitlisted'
  recipient_count: number
  sent_at: string
  sent_by_uid?: string
}

export interface AssignmentSlot {
  id: string
  name: string          // "Cabin 4", "Table 7", "Blue Team", "Butterflies Class"
  capacity?: number     // max occupants; undefined = unlimited
  notes?: string
  sort_order?: number   // display ordering (lower = first)
  created_at: string
  updated_at?: string
}

export type FormFieldType = 'text' | 'textarea' | 'checkbox' | 'radio' | 'dropdown' | 'date'

export type FormType =
  | 'liability_waiver'
  | 'medical_authorization'
  | 'photo_consent'
  | 'code_of_conduct'
  | 'background_check_consent'
  | 'custom'

export type FormAudience = 'registrant' | 'volunteer' | 'staff'

export type FormFieldConditionOperator = 'equals' | 'not_equals' | 'is_checked' | 'is_not_empty'

export interface FormFieldCondition {
  dependsOn: string                       // FormField.id this field's visibility depends on
  operator: FormFieldConditionOperator
  value: string                           // compared for equals/not_equals; ignored for is_checked/is_not_empty
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  required: boolean
  options?: string[]           // only used for 'radio' and 'dropdown'
  placeholder?: string
  condition?: FormFieldCondition  // when set, field shows only if the condition is met
}

export interface FormTemplate {
  id: string
  name: string
  form_type: FormType
  audience: FormAudience
  fields: FormField[]
  version: number
  created_at: string
  updated_at?: string
}

export interface EventFormAssignment {
  id: string
  template_id: string
  template_name: string
  template_version: number
  fields_snapshot: FormField[]
  audience: FormAudience
  required: boolean
  created_at: string
}

export interface SignedForm {
  id: string
  org_id: string    // denormalized for cross-org safety in collectionGroup queries
  event_id: string   // denormalized for consistency
  assignment_id: string
  template_id: string
  template_version: number
  template_name: string
  responses: Record<string, string | boolean | string[]>
  signature_name: string
  signer_ip: string
  signed_at: string
  created_at: string
}

export type EventPersonKind = 'staff' | 'volunteer'

export interface PermissionTemplate {
  id: string
  name: string
  description?: string
  pages: EventPage[]
  is_built_in?: boolean
  created_at?: string
  updated_at?: string
}

export interface EventPerson {
  id: string
  kind: EventPersonKind
  name: string
  email: string
  role: string
  pages: EventPage[]
  applied_template_id?: string | null
  created_at: string
  updated_at?: string
}

export type CheckinStatus = 'in' | 'out'

export interface CheckinRecord {
  id: string             // `${date}_${member_id}`
  date: string           // ISO date 'YYYY-MM-DD'
  member_id: string
  family_id: string
  member_name: string
  status: CheckinStatus
  checked_in_at: string
  checked_in_by?: string
  checked_out_at?: string
  guardian_pickup_name?: string
}

export interface EventMember {
  member_id: string
  family_id: string
  first_name: string
  last_name: string
  family_name: string
}

export type SendingDomainStatus = 'pending' | 'verified' | 'failed'

export interface DomainDnsRecord {
  record: string
  name: string
  type: string
  value: string
  priority?: number
  ttl?: string
}

export interface ItineraryItem {
  id: string
  day: string          // ISO date 'YYYY-MM-DD'
  start_time: string   // 'HH:MM' 24-hour
  end_time?: string    // 'HH:MM' 24-hour, optional
  title: string
  location?: string
  description?: string
  sort_order: number
  created_at: string
  updated_at?: string
}

export interface VolunteerHoursEntry {
  id: string
  person_id: string    // EventPerson id
  person_name: string  // denormalized for display
  date: string         // ISO date 'YYYY-MM-DD'
  hours: number
  note?: string
  created_at: string
}

export interface Department {
  id: string
  name: string
  description?: string
  sort_order?: number
  created_at: string
  updated_at?: string
}

export type LeadStage = 'inquiry' | 'consultation' | 'proposal' | 'closed_won' | 'closed_lost'

export type LostReason = 'over_budget' | 'went_elsewhere' | 'date_fell_through' | 'no_response'

export interface LeadWaiting {
  reason: string
  follow_up_date?: string
}

export interface Lead {
  id: string
  name: string
  title?: string               // the opportunity's own label; falls back to `name` when absent
  email?: string
  phone?: string
  organization?: string
  event_type?: string          // free text, e.g. "Wedding", "Corporate gala"
  event_date?: string          // ISO date, optional
  estimated_value?: number     // dollars
  stage: LeadStage
  notes?: string
  portal_token?: string   // lazily generated; powers the login-free client portal link
  customer_id?: string    // linked Customer once one exists
  tags?: string[]
  waiting?: LeadWaiting    // set when the lead is blocked/waiting on something
  guest_count?: number     // estimated guests; prefills convert headcount
  source?: 'intake' | 'manual'  // how the lead entered the pipeline; absent on pre-2026-08 leads
  last_touch_at?: string   // ISO; stamped by logActivity; fallback updated_at ?? created_at
  closed_at?: string       // ISO; stamped entering closed_won/closed_lost, cleared on reopen
  lost?: { reason: LostReason; note?: string }
  created_at: string
  updated_at?: string
}

export interface Task {
  id: string
  lead_id: string
  title: string
  due_date?: string
  done: boolean
  done_at?: string
  created_at: string
}

export interface Customer {
  id: string
  name: string
  company?: string
  email?: string
  email_lower?: string   // normalized dedup key; derived from email, never displayed
  phone?: string
  tags?: string[]
  notes?: string
  last_touch_at?: string   // ISO; stamped by logActivity, mirrors Lead.last_touch_at
  created_at: string
  updated_at?: string
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'voided'

export interface ProposalPackage {
  id: string
  name: string                 // builder-named: "Good" / "Better" / "Best"
  description?: string
  // LEGACY pair — written only by pre-v2 documents. A package with no
  // `item_ids` is legacy: `includes` + `price` are authoritative, read-only.
  includes: string[]
  price: number                // legacy: authoritative flat price.
                               // composed: DERIVED (sum or override), recomputed
                               // server-side on write and stored denormalized.
  // COMPOSED pair — presence of `item_ids` marks a v2 package.
  item_ids?: string[]          // ordered refs into the proposal's line_items pool
  price_override?: number      // optional round-number override of the computed sum
  recommended?: boolean
}

export interface ProposalLineItem {
  id?: string                  // stable id; a selection references it (optional for back-compat)
  description: string
  quantity: number
  unit_price: number           // dollars (may be decimal)
  unit?: string                // optional: "hr", "each", "day" — display + future invoicing
  optional?: boolean           // true = customer-toggleable add-on; missing/false = required base scope
  taxable?: boolean            // default true; stored now, honored in a later increment
}

export const PROPOSAL_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'image', 'testimonial'] as const
export type ProposalBlockType = (typeof PROPOSAL_BLOCK_TYPES)[number]

// `placeholder` marks skeleton-authored content: greyed in the builder,
// silently skipped on public/print render, cleared on first human edit.
export type ProposalBlock =
  | { id: string; type: 'heading'; text: string; level?: 2 | 3; placeholder?: boolean }
  | { id: string; type: 'paragraph'; text: string; placeholder?: boolean }
  | { id: string; type: 'list'; items: string[]; ordered?: boolean; placeholder?: boolean }
  | { id: string; type: 'image'; url: string; alt?: string; caption?: string; placeholder?: boolean }
  | { id: string; type: 'testimonial'; quote: string; attribution?: string; placeholder?: boolean }

export interface ProposalDiscount { type: 'percent' | 'fixed'; value: number }
export interface ProposalDeposit { type: 'percent' | 'fixed'; value: number }  // captured now, collected later

export interface ProposalSelection {
  package_id?: string
  optional_item_ids: string[]
  selected_total: number       // recomputed server-side; never trusted from the client
  selected_at: string          // ISO
}

export interface Proposal {
  id: string
  org_id: string               // denormalized for collectionGroup token lookups
  lead_id: string              // the opportunity id
  token: string                // unguessable public link token
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[] // if present (max 3), the customer must pick exactly one
  discount?: ProposalDiscount
  tax_rate?: number            // percent, e.g. 8.25
  deposit?: ProposalDeposit
  expires_at?: string          // ISO; enforced both when signing (signProposal) and when starting a before_accept deposit payment (proposal-deposit/intent route)
  notes?: string
  blocks?: ProposalBlock[]     // document content, rendered above the pricing section
  selection?: ProposalSelection
  client_response_at?: string  // set when the client accepts/rejects
  first_opened_at?: string // first portal view of a sent proposal
  last_opened_at?: string  // latest portal view; throttled to one write per hour
  void_reason?: string         // set when status transitions to 'voided'
  voided_at?: string           // ISO; set when status transitions to 'voided'
  created_at: string
  updated_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  terms?: string               // legal terms; snapshot from Org.default_proposal_terms at creation, editable per proposal; participates in the signed document hash when present
  payment_status?: PaymentStatus
  signature?: ProposalSignature
  deposit_payment?: ProposalDepositPayment
  pending_signature?: PendingSignature
  events?: ProposalEvent[]
}

export type PaymentStatus = 'not_required' | 'deposit_pending' | 'deposit_paid'

export interface ProposalSignature {
  signer_name: string
  signer_email: string
  signed_at: string          // server UTC ISO
  ip: string                 // server-derived
  user_agent: string         // server-derived
  consent_electronic: true   // recorded acknowledgment
  document_hash: string      // sha256 of the canonical signed document
}

export interface ProposalEvent {
  kind: 'sent' | 'viewed' | 'accepted' | 'signed' | 'deposit_paid' | 'declined'
  at: string                 // server UTC ISO
  ip?: string
  user_agent?: string
}

export interface ProposalDepositPayment {
  intent_id: string
  amount: number             // dollars
  paid_at?: string
}

// Captured server-side at sign time for the before_accept path; promoted to
// `signature` by the webhook once the deposit succeeds. Never client-trusted.
export interface PendingSignature {
  signer_name: string
  signer_email: string
  captured_at: string
  ip: string
  user_agent: string
  document_hash: string
  selection: ProposalSelection
}

export type InvoiceType = 'quick' | 'deposit' | 'progress' | 'final'
export type InvoiceLifecycle = 'draft' | 'approved' | 'issued' | 'voided' | 'replaced' | 'closed'
export type InvoiceDeliveryStatus = 'not_sent' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'viewed' | 'downloaded'
export type InvoiceAccountingStatus = 'not_connected' | 'ready' | 'syncing' | 'synced' | 'error' | 'mismatch'
export type InvoiceDisputeStatus = 'none' | 'question' | 'under_review' | 'adjustment_proposed' | 'resolved' | 'escalated'
export type InvoicePaymentStatus = 'not_due' | 'due' | 'partial' | 'paid' | 'overpaid' | 'refunded' | 'void'
export type InvoiceAgingBucket = 'current' | 'due_soon' | 'due_today' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'

export type InvoiceSourceType =
  | 'proposal' | 'change_order' | 'job' | 'milestone'
  | 'time' | 'expense' | 'recurring' | 'manual'

export interface InvoiceSourceRef {
  type: InvoiceSourceType
  id?: string      // e.g. accepted proposal id
  label?: string   // human ref, e.g. "Accepted proposal"
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number   // dollars
  source?: InvoiceSourceRef
  taxable?: boolean
}

export interface InvoiceDiscount { type: 'percent' | 'fixed'; value: number }
export interface InvoiceCredit { description: string; amount: number }

export interface InvoicePayment {
  amount: number       // dollars APPLIED to the balance
  method?: string      // e.g. 'cash' | 'check' | 'card' | free text
  note?: string
  recorded_at: string  // ISO
  tip_amount?: number  // gratuity — EXCLUDED from balance and progress math
}

export interface Invoice {
  id: string
  org_id: string
  lead_id: string
  customer_id?: string          // CRM seam — populated when Customer ships
  token: string
  schema_version?: number       // absent/legacy => v1; new invoices => 2

  type?: InvoiceType
  lifecycle?: InvoiceLifecycle
  delivery?: InvoiceDeliveryStatus
  accounting?: InvoiceAccountingStatus
  dispute?: InvoiceDisputeStatus

  source?: InvoiceSourceRef
  number?: string
  title?: string
  line_items: InvoiceLineItem[]
  payments: InvoicePayment[]
  notes?: string
  due_date?: string
  tips_enabled?: boolean
  discount?: InvoiceDiscount
  tax_rate?: number
  credits?: InvoiceCredit[]

  payment_status?: InvoicePaymentStatus  // materialized cache for future indexed views

  replaces_id?: string
  replaced_by_id?: string
  void_reason?: string
  issued_at?: string
  created_at: string
  updated_at?: string
}

export type NormalizedInvoice = Invoice & {
  type: InvoiceType
  lifecycle: InvoiceLifecycle
  delivery: InvoiceDeliveryStatus
  accounting: InvoiceAccountingStatus
  dispute: InvoiceDisputeStatus
}

export interface Note {
  id: string
  parent_type: 'customer' | 'opportunity'
  parent_id: string
  body: string
  created_at: string
}

export interface ActivityEvent {
  id: string
  parent_type: 'customer' | 'opportunity'
  parent_id: string
  kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting' | 'converted' | 'lost' | 'nudge'
  summary: string
  stage?: LeadStage   // structured stage for kind:'stage' events; summary string is display-only
  created_at: string
}

export type VendorStatus = 'potential' | 'confirmed' | 'declined'

export interface Vendor {
  id: string
  lead_id: string
  name: string
  service?: string       // e.g. Florist, Catering, DJ, Photography
  contact_name?: string
  email?: string
  phone?: string
  cost?: number          // dollars
  status: VendorStatus
  notes?: string
  created_at: string
  updated_at?: string
}

// ── Operations core (spec 2026-08-05 §3) ─────────────────────────────

// ── Units & conversions (spec 2026-08-13 §3) ─────────────────────────

export type Dimension = 'volume' | 'weight' | 'count'

/** A physical quantity: amount + unit string (normalized lowercase). */
export interface Quantity {
  qty: number
  unit: string
}

/**
 * Ingredient-specific conversion, AI-inferred or operator-entered:
 * density (weight↔volume), yield (1 lb beans → 40 shot), or custom
 * serving units (1 keg → 124 pint). Never duplicates the universal table.
 */
export interface ConversionBridge {
  from: Quantity
  to: Quantity
  source: 'ai' | 'operator'
  note?: string
}

export type ResourceKind = 'consumable' | 'reusable' | 'serialized'

export interface OpsResource {
  id: string
  name: string
  kind: ResourceKind
  unit?: string        // display unit for quantities: 'oz', 'each', 'gal'
  unit_cost?: number   // dollars per `unit`; feeds closeout margin
  dimension?: Dimension            // fundamental measure; legacy docs inferred on read (spec §3.3)
  conversions?: ConversionBridge[] // AI/operator bridges: density, yields, custom serving units
  notes?: string
  created_at: string
  updated_at?: string
}

export type WorkPackageLine =
  // consumable quantities: bare numbers are legacy docs, read as the resource's
  // display unit (spec 2026-08-13 §4.1); new writes use Quantity.
  | { kind: 'consumable'; resource_id: string; qty_per_guest: number | Quantity; base_qty?: number | Quantity }
  | { kind: 'equipment'; resource_id: string; qty: number }
  | { kind: 'labor'; role: string; count: number }   // recorded stub; staffing is a later phase

export interface WorkPackage {
  id: string
  name: string
  description?: string
  scope?: string                     // customer-facing scope text
  price: number                      // dollars
  max_guests?: number
  lines: WorkPackageLine[]
  setup_minutes?: number
  teardown_minutes?: number
  checklist_template_ids?: string[]  // org checklist templates attached to this package
  created_at: string
  updated_at?: string
}

export type ChecklistPhase = 'prep' | 'load-out' | 'setup' | 'service-close' | 'closeout'
export type EvidenceType = 'none' | 'photo' | 'number'

export interface ChecklistTemplateStep {
  text: string
  evidence: EvidenceType
}

export interface ChecklistTemplate {
  id: string
  name: string
  phase: ChecklistPhase
  steps: ChecklistTemplateStep[]
  created_at: string
  updated_at?: string
}

export interface OpsDeadline {
  id: string          // stable template id, e.g. 'dl-order-consumables'
  label: string
  due: string         // ISO date (YYYY-MM-DD)
  done: boolean
}

export interface OpsListItem {
  resource_id: string
  name: string        // denormalized resource name at derivation time
  qty: number
  unit?: string
  needs_conversion?: boolean  // quantity kept in its entered unit; no path to the resource's canonical unit (spec §3.4)
  checked: boolean
}

export interface OpsChecklistStep {
  text: string
  evidence: EvidenceType
  done: boolean
  evidence_value?: string   // photo URL or recorded number, set on completion
  done_at?: string
  done_by?: string          // uid
}

export interface OpsChecklist {
  id: string                // instance id = source template id (unique per plan)
  name: string
  phase: ChecklistPhase
  steps: OpsChecklistStep[]
}

export interface OpsRequirements {
  guests: number
  // `YYYY-MM-DDTHH:mm` — NOT full ISO. The only writers are
  // <Input type="datetime-local"> (RequirementsCard, OpsSetup), which emits
  // that shape and rejects a trailing `Z` by rendering the field empty.
  // RequirementsCard also prints the stored value raw when not editing.
  service_start?: string
  service_end?: string
  site_needs?: string[]      // e.g. ['power', 'water', 'ice', 'parking']
  notes?: string
}

export interface OpsChangeEntry {
  at: string
  by: string                 // uid, or 'system' for derivation-triggered entries
  field: string              // requirements field that changed, e.g. 'guests'
  from?: string              // stringified previous value
  to?: string                // stringified new value
}

export interface OpsPlan {
  package_ids: string[]
  requirements: OpsRequirements
  deadlines: OpsDeadline[]
  shopping_list: OpsListItem[]
  packing_list: OpsListItem[]
  checklists: OpsChecklist[]
  needs_review: boolean      // set when a change re-derived artifacts; cleared by acknowledge
  change_log: OpsChangeEntry[]
  industry_pack_id?: string  // pack the plan was derived under (for re-derivation)
  created_at: string
  updated_at?: string
}

export interface CloseoutSummary {
  planned_consumable_cost: number
  actual_consumable_cost: number
  revenue: number            // package prices + recorded sales
  planned_margin: number     // revenue - planned cost
  actual_margin: number      // revenue - actual cost
  cost_gaps?: string[]  // resource names omitted from planned cost: cost known but no conversion path to its unit (spec §4.3)
}

export type IssueSeverity = 'low' | 'medium' | 'high'

export interface OpsIssue {
  id: string
  type: string            // free-form category: 'equipment', 'supply', 'venue', 'staff', 'other'
  severity: IssueSeverity
  note: string
  status: 'open' | 'resolved'
  resolution?: string
  created_by: string      // uid
  created_at: string
  resolved_at?: string
}

export interface OpsActuals {
  consumables?: { resource_id: string; qty_used: number }[]
  hours_worked?: number
  sales?: number         // tips + on-site sales, dollars
  waste_notes?: string
}

export interface OpsCloseout {
  actuals: OpsActuals
  completed: boolean     // spec §3.5: the event is not "complete" until this is
  completed_at?: string
  created_at: string
  updated_at?: string
}

// ── Compliance tracker (spec 2026-08-05 §4.3 — thin, org-configurable) ──

export interface ComplianceDoc {
  id: string
  name: string          // 'Health permit', 'Liability insurance'
  expires_on?: string   // ISO date (YYYY-MM-DD); absent = no expiry
  link_url?: string     // where the document lives (drive, city portal…)
  notes?: string
  created_at: string
  updated_at?: string
}
