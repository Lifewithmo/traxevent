export type OrgRole = 'owner' | 'admin' | 'staff'

export type CampRegistrationType = 'family' | 'individual' | 'child'

export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
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
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  camp_start: string
  camp_end: string
  created_at: string
}

// Shape of our Firebase Auth JWT custom claims
export interface AuthClaims {
  orgId: string
  orgSlug: string
  role: OrgRole | 'platform_admin'
}
