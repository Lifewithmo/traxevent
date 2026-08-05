'use server'

import { adminDb } from '@/lib/firebase-admin'
import { setOrgClaims } from '@/actions/auth'
import type { Org, OrgRole } from '@/lib/types'
import { slugify } from '@/lib/slug'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { getAllIndustryPacks } from '@/lib/industry-packs'
import { getBrand, validBrandParam } from '@/lib/brands'

export async function createOrg(
  uid: string,
  orgName: string,
  displayName: string,
  email: string,
  brandId?: string
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

  // Acquisition brand (spec §2): a signup through brewtrax.com lands in an org
  // pre-configured with that brand's industry pack. Firestore rejects undefined,
  // so fields are only added when a valid brand is present.
  //
  // Durable fallback: the explicit param only survives an unbroken
  // signup→onboarding hop. If it's missing/invalid, fall back to the brand_id
  // createUser stamped on the user doc, so an interrupted flow doesn't
  // silently lose attribution. Explicit param still wins when present.
  let validBrand = validBrandParam(brandId)
  if (!validBrand) {
    const userSnap = await adminDb.collection('users').doc(uid).get()
    validBrand = validBrandParam(userSnap.exists ? (userSnap.data()?.brand_id as string | undefined) : undefined)
  }
  if (validBrand) {
    org.brand_id = validBrand
    org.industry_pack_id = getBrand(validBrand).industryPackId
  }

  await orgRef.set(org)

  // Add creator as owner
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('members').doc(uid)
    .set({ uid, role: 'owner' as OrgRole, display_name: displayName, email, event_access: {} })

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

export async function setOrgIndustry(orgId: string, industryPackId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const known = getAllIndustryPacks().some((p) => p.id === industryPackId)
  if (!known) throw new Error('Unknown industry pack')
  await adminDb.collection('orgs').doc(orgId).update({ industry_pack_id: industryPackId })
}
