'use server'

import { adminDb } from '@/lib/firebase-admin'
import { attachAccessToken } from '@/actions/access-tokens'
import { sendRegistrationConfirmation } from '@/lib/email'
import type { Family, FamilyMember } from '@/lib/types'
import { buildFamilyId } from '@/lib/tokens'

export interface CreateRegistrationInput {
  orgId: string
  campId: string
  orgSlug: string
  campSlug: string
  campName: string
  orgName: string
  family: Omit<Family,
    | 'id' | 'org_id' | 'camp_id' | 'org_slug' | 'camp_slug'
    | 'camp_name' | 'org_name' | 'registration_status' | 'payment_status'
    | 'registrant_uid' | 'pco_household_id' | 'access_token'
    | 'access_token_expires_at' | 'created_at' | 'updated_at'
  >
  members: Omit<FamilyMember, 'id' | 'family_id'>[]
  registrantUid?: string
}

export async function createRegistration(
  input: CreateRegistrationInput
): Promise<{ familyId: string; accessToken: string }> {
  const familyId = buildFamilyId()
  const now = new Date().toISOString()

  const family: Family = {
    id: familyId,
    org_id: input.orgId,
    camp_id: input.campId,
    org_slug: input.orgSlug,
    camp_slug: input.campSlug,
    camp_name: input.campName,
    org_name: input.orgName,
    ...input.family,
    registration_status: 'pending',
    payment_status: 'unpaid',
    registrant_uid: input.registrantUid ?? null,
    pco_household_id: null,
    access_token: null,
    access_token_expires_at: null,
    created_at: now,
    updated_at: now,
  }

  const familyRef = adminDb
    .collection('orgs').doc(input.orgId)
    .collection('camps').doc(input.campId)
    .collection('families').doc(familyId)

  await familyRef.set(family)

  // Write each family member
  for (const member of input.members) {
    const memberId = buildFamilyId()
    await familyRef
      .collection('family_members').doc(memberId)
      .set({ id: memberId, family_id: familyId, ...member })
  }

  // Attach signed URL token
  const accessToken = await attachAccessToken(input.orgId, input.campId, familyId)

  // Send confirmation email
  await sendRegistrationConfirmation({
    to: input.family.email,
    firstName: input.family.first_name,
    campName: input.campName,
    orgName: input.orgName,
    orgSlug: input.orgSlug,
    campSlug: input.campSlug,
    familyId,
    accessToken,
  })

  return { familyId, accessToken }
}

export async function getRegistrationByToken(
  orgId: string,
  campId: string,
  token: string
): Promise<Family | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('access_token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) return null
  return snap.docs[0].data() as Family
}

export async function getRegistrationByUid(
  orgId: string,
  campId: string,
  uid: string
): Promise<Family | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('registrant_uid', '==', uid)
    .limit(1)
    .get()

  if (snap.empty) return null
  return snap.docs[0].data() as Family
}

export async function getAllRegistrationsByUid(uid: string): Promise<Family[]> {
  const snap = await adminDb
    .collectionGroup('families')
    .where('registrant_uid', '==', uid)
    .orderBy('created_at', 'desc')
    .get()

  return snap.docs.map((d) => d.data() as Family)
}

export async function getFamilyMembers(
  orgId: string,
  campId: string,
  familyId: string
): Promise<FamilyMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .collection('family_members')
    .get()

  return snap.docs.map((d) => d.data() as FamilyMember)
}

export async function updateRegistration(
  orgId: string,
  campId: string,
  familyId: string,
  updates: Partial<Pick<Family,
    'first_name' | 'last_name' | 'email' | 'phone' |
    'address' | 'emergency_contact'
  >>
): Promise<void> {
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ ...updates, updated_at: new Date().toISOString() })
}

export async function linkRegistrantAccount(
  orgId: string,
  campId: string,
  familyId: string,
  uid: string
): Promise<void> {
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ registrant_uid: uid, updated_at: new Date().toISOString() })
}
