import type { Terminology } from '@/lib/event-types'

export type OrgRole = 'owner' | 'admin' | 'staff'

export type CampRegistrationType = 'family' | 'individual' | 'child'

export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
  stripe_customer_id?: string
  stripe_account_id?: string
  sending_domain?: string
  sending_domain_id?: string
  sending_domain_status?: SendingDomainStatus
  sending_domain_records?: DomainDnsRecord[]
  network_id?: string | null
  region_id?: string | null
  created_at: string
}

export type NetworkRole = 'admin' | 'coordinator'

export interface Network {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Region {
  id: string
  name: string
  created_at: string
}

export interface NetworkMember {
  uid: string
  role: NetworkRole
  display_name: string
  email: string
  region_ids?: string[]
}

export const CAMP_PAGES = [
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
] as const

export type CampPage = typeof CAMP_PAGES[number]

export interface OrgMember {
  uid: string
  role: OrgRole
  display_name: string
  email: string
  camp_access: Record<string, { pages: CampPage[] }>
  department_access?: Record<string, { pages: CampPage[] }>  // per-department grants, inherited by that dept's events
}

export interface OrgInvitation {
  token: string
  email: string
  role: OrgRole
  created_at: string
  expires_at: string
  accepted_at?: string
}

export interface Camp {
  id: string
  name: string
  slug: string
  year: number
  status: 'draft' | 'active' | 'archived'
  registration_type: CampRegistrationType
  event_type_id: string              // drives terminology + UI config
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  camp_start: string
  camp_end: string
  registration_open?: string         // ISO date, optional
  registration_close?: string        // ISO date, optional
  capacity?: number                  // max registrants, optional
  created_at: string
  updated_at?: string                // set on every updateCamp call
  payment_amount?: number            // registration fee in dollars (e.g. 150 = $150.00); omit or 0 for free events
  from_display_name?: string  // display name in email "from" field, e.g. "Summer Camp 2026 at First Baptist"
  reply_to_email?: string     // reply-to address; replies route to this address instead of TraxEvent
  itinerary_published?: boolean
  event_type_terminology?: Terminology
  department_id?: string | null   // optional grouping; null/undefined = unassigned
}

// Shape of our Firebase Auth JWT custom claims
export interface AuthClaims {
  orgId: string
  orgSlug: string
  role: OrgRole | 'platform_admin'
  networkId?: string
  networkSlug?: string
  networkRole?: NetworkRole
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
  camp_id: string
  org_slug: string
  camp_slug: string
  camp_name: string
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
  network_template_id?: string   // set on an org copy pushed from a network template (provenance)
  network_id?: string            // the network that pushed this copy
  pushed_at?: string             // last push timestamp
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
  camp_id: string   // denormalized for consistency
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
  pages: CampPage[]
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
  pages: CampPage[]
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
