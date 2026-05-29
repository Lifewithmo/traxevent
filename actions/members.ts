'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { setOrgClaims } from '@/actions/auth'
import {
  CAMP_PAGES,
  type OrgRole,
  type OrgMember,
  type OrgInvitation,
  type CampPage,
} from '@/lib/types'

export function buildInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function validateCampPages(pages: string[]): CampPage[] {
  return pages.filter((p): p is CampPage =>
    (CAMP_PAGES as readonly string[]).includes(p)
  )
}

export async function createInvitation(
  orgId: string,
  email: string,
  role: OrgRole
): Promise<OrgInvitation> {
  const token = buildInviteToken()
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const invitation: OrgInvitation = {
    token,
    email,
    role,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('invitations').doc(token)
    .set(invitation)

  return invitation
}

export async function acceptInvitation(
  token: string,
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  const snap = await adminDb
    .collectionGroup('invitations')
    .where('token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) throw new Error('Invitation not found')

  const invRef = snap.docs[0].ref
  const inv = snap.docs[0].data() as OrgInvitation

  if (inv.accepted_at) throw new Error('Invitation already used')
  if (new Date(inv.expires_at) < new Date()) throw new Error('Invitation expired')

  const orgId = invRef.parent.parent!.id

  // Look up org slug for claims
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const orgSlug = (orgSnap.data() as { slug: string }).slug

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: inv.role, display_name: displayName, email, camp_access: {} })

  await invRef.update({ accepted_at: new Date().toISOString() })
  await setOrgClaims(uid, orgId, orgSlug, inv.role)
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('members')
    .get()
  return snap.docs.map((d) => d.data() as OrgMember)
}

export async function updateStaffCampAccess(
  orgId: string,
  uid: string,
  campId: string,
  pages: string[]
): Promise<void> {
  const validPages = validateCampPages(pages)
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .update({ [`camp_access.${campId}.pages`]: validPages })
}
