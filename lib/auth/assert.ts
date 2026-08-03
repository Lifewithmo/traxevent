import 'server-only'

import { adminDb } from '@/lib/firebase-admin'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessCampPage } from '@/lib/auth/access'
import type { Camp, OrgMember, CampPage } from '@/lib/types'

// Throw-based guards for SERVER ACTIONS (pages use the redirect-based guards in guards.ts).
// assertOrgMember: caller must be a verified member of orgId. Returns the member.
export async function assertOrgMember(orgId: string): Promise<OrgMember> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  if (user.role === 'platform_admin') {
    const snap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
    return (snap.exists ? snap.data() : { uid: user.uid, role: 'admin', display_name: '', email: '', camp_access: {} }) as OrgMember
  }
  if (user.orgId !== orgId) throw new Error('Forbidden')
  const snap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
  if (!snap.exists) throw new Error('Forbidden')
  return snap.data() as OrgMember
}

// Owner/admin only (org-config mutations).
export async function assertOrgAdmin(orgId: string): Promise<OrgMember> {
  const member = await assertOrgMember(orgId)
  if (member.role !== 'owner' && member.role !== 'admin') throw new Error('Forbidden')
  return member
}

// Camp-scoped: caller must be an org member AND have access to `page` for `campId`.
export async function assertCampPage(orgId: string, campId: string, page: CampPage): Promise<OrgMember> {
  const member = await assertOrgMember(orgId)
  const campSnap = await adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).get()
  const departmentId = campSnap.exists ? ((campSnap.data() as Camp).department_id ?? null) : null
  if (!canAccessCampPage(member, campId, page, departmentId)) throw new Error('Forbidden')
  return member
}
