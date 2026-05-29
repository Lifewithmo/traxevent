'use server'

import { adminDb } from '@/lib/firebase-admin'
import { setOrgClaims } from '@/actions/auth'
import type { Org, OrgRole } from '@/lib/types'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function createOrg(
  uid: string,
  orgName: string,
  displayName: string,
  email: string
): Promise<Org> {
  const slug = slugify(orgName)
  const orgRef = adminDb.collection('orgs').doc()
  const orgId = orgRef.id

  const org: Org = {
    id: orgId,
    name: orgName,
    slug,
    billing_status: 'trialing',
    created_at: new Date().toISOString(),
  }

  await orgRef.set(org)

  // Add creator as owner
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: 'owner' as OrgRole, display_name: displayName, email, camp_access: {} })

  // Set JWT claims (orgSlug included so login redirect works without extra lookup)
  await setOrgClaims(uid, orgId, slug, 'owner')

  return org
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await adminDb.collection('orgs').doc(orgId).get()
  return snap.exists ? (snap.data() as Org) : null
}

export async function getOrgBySlug(slug: string): Promise<Org | null> {
  const snap = await adminDb
    .collection('orgs')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  if (snap.empty) return null
  return snap.docs[0].data() as Org
}
