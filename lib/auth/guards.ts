import 'server-only'

import { redirect, notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessCampPage } from '@/lib/auth/access'
import type { Org, Camp, OrgMember, CampPage } from '@/lib/types'

// Require a logged-in member of the org identified by orgSlug.
// Redirects to /login if unauthenticated; notFound() if the caller is not a member of THIS org.
export async function requireOrgMember(orgSlug: string): Promise<{ org: Org; orgId: string; member: OrgMember }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = orgSnap.docs[0].data() as Org
  const orgId = orgSnap.docs[0].id

  // Platform admins may access any org.
  if (user.role !== 'platform_admin' && user.orgId !== orgId) notFound()

  const memberSnap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
  if (!memberSnap.exists && user.role !== 'platform_admin') notFound()
  const member = (memberSnap.exists
    ? (memberSnap.data() as OrgMember)
    : { uid: user.uid, role: 'admin', display_name: '', email: '', camp_access: {} }) as OrgMember

  return { org, orgId, member }
}

// Require org membership AND access to a specific camp page. Resolves ids and enforces camp_access.
// Redirects to the org home if the member lacks access to the page.
export async function requireCampPage(
  orgSlug: string,
  campSlug: string,
  page: CampPage
): Promise<{ orgId: string; campId: string; camp: Camp; member: OrgMember }> {
  const { orgId, member } = await requireOrgMember(orgSlug)

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()
  const camp = campSnap.docs[0].data() as Camp
  const campId = campSnap.docs[0].id

  if (!canAccessCampPage(member, campId, page)) redirect(`/${orgSlug}`)

  return { orgId, campId, camp, member }
}

// Require org membership + resolve the camp, WITHOUT a per-page check. Used for the
// camp dashboard (every camp card links here) and other any-member camp entry points.
export async function requireCamp(
  orgSlug: string,
  campSlug: string
): Promise<{ orgId: string; campId: string; camp: Camp; member: OrgMember }> {
  const { orgId, member } = await requireOrgMember(orgSlug)
  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()
  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp, member }
}

// List the camp pages a member may access (for nav filtering).
export function allowedCampPages(member: OrgMember, campId: string, allPages: CampPage[]): CampPage[] {
  if (member.role === 'owner' || member.role === 'admin') return allPages
  return allPages.filter((p) => canAccessCampPage(member, campId, p))
}
