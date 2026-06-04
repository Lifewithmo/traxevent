export type OrgRole = 'owner' | 'admin' | 'staff'

export type CampRegistrationType = 'family' | 'individual' | 'child'

export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
  stripe_customer_id?: string
  stripe_account_id?: string
  created_at: string
}

export const CAMP_PAGES = [
  'dashboard',
  'families',
  'assignments',
  'teams',
  'budget',
  'itinerary',
  'communicate',
  'reports',
] as const

export type CampPage = typeof CAMP_PAGES[number]

export interface OrgMember {
  uid: string
  role: OrgRole
  display_name: string
  email: string
  camp_access: Record<string, { pages: CampPage[] }>
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
