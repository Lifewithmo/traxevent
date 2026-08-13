'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { setOrgClaims } from '@/actions/auth'
import type { Org, OrgBranding, OrgRole } from '@/lib/types'
import { parseOrgBranding } from '@/lib/branding'
import { slugify } from '@/lib/slug'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { getAllIndustryPacks } from '@/lib/industry-packs'
import { getBrand, validBrandParam } from '@/lib/brands'
import { MAX_TERMS_CHARS } from '@/lib/proposals/draft'

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

/**
 * Replace the org's brand kit. Input is validated by parseOrgBranding —
 * cleared fields simply vanish from the stored map, so a full overwrite is
 * also the delete path (spec §2: never store un-validated).
 */
export async function updateOrgBranding(orgId: string, input: OrgBranding): Promise<OrgBranding> {
  await assertOrgAdmin(orgId)
  const branding = parseOrgBranding(input)
  await adminDb.collection('orgs').doc(orgId).update({ branding })
  return branding
}

/** Save the optional "How we sound" note used by AI proposal drafting. */
export async function updateOrgVoiceNote(orgId: string, note: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const trimmed = typeof note === 'string' ? note.trim().slice(0, 1000) : ''
  await adminDb.collection('orgs').doc(orgId).update({ ai_voice_note: trimmed || FieldValue.delete() })
}

export async function setOrgIndustry(orgId: string, industryPackId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const known = getAllIndustryPacks().some((p) => p.id === industryPackId)
  if (!known) throw new Error('Unknown industry pack')
  await adminDb.collection('orgs').doc(orgId).update({ industry_pack_id: industryPackId })
}

/**
 * The org's standard proposal terms — copied into each NEW proposal's `terms`
 * at creation (a snapshot: editing this never mutates existing proposals).
 * Blank input clears the field.
 */
export async function updateOrgDefaultProposalTerms(orgId: string, terms: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const trimmed = (typeof terms === 'string' ? terms : '').trim().slice(0, MAX_TERMS_CHARS)
  await adminDb.collection('orgs').doc(orgId).update({
    default_proposal_terms: trimmed || FieldValue.delete(),
  })
  return trimmed
}
