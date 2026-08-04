'use server'

import { adminDb } from '@/lib/firebase-admin'
import { attachAccessToken } from '@/actions/access-tokens'
import { sendRegistrationConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Event, Family, FamilyMember } from '@/lib/types'
import { buildFamilyId } from '@/lib/tokens'
import { mergeSavedMembers } from '@/lib/saved-members'
import { getRegistrantProfile, updateRegistrantProfile } from '@/actions/registrant-auth'
import { assertFamilyAccess } from '@/lib/auth/family-access'
import { getCurrentUser } from '@/lib/auth/session'
import { assertEventPage } from '@/lib/auth/assert'

export interface CreateRegistrationInput {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  eventName: string
  orgName: string
  family: Omit<Family,
    | 'id' | 'org_id' | 'event_id' | 'org_slug' | 'event_slug'
    | 'event_name' | 'org_name' | 'registration_status' | 'payment_status'
    | 'registrant_uid' | 'pco_household_id' | 'access_token'
    | 'access_token_expires_at' | 'created_at' | 'updated_at'
  >
  members: Omit<FamilyMember, 'id' | 'family_id'>[]
  registrantUid?: string
  skipConfirmationEmail?: boolean  // set true for paid registrations; email sent after payment webhook
}

export async function createRegistration(
  input: CreateRegistrationInput
): Promise<{ familyId: string; accessToken: string; waitlisted: boolean }> {
  const familyId = buildFamilyId()
  const now = new Date().toISOString()

  // Determine registration status — check capacity if set on the event
  let registrationStatus: Family['registration_status'] = 'pending'

  const eventRef = adminDb
    .collection('orgs').doc(input.orgId)
    .collection('events').doc(input.eventId)

  const eventSnap = await eventRef.get()
  const event = eventSnap.exists ? (eventSnap.data() as Event) : null
  if (!event) throw new Error(`Event not found: ${input.eventId}`)

  if (event?.capacity) {
    const familiesSnap = await eventRef.collection('families').get()
    const activeCount = familiesSnap.docs.reduce((count, doc) => {
      const status = (doc.data() as Family).registration_status
      return status === 'pending' || status === 'confirmed' ? count + 1 : count
    }, 0)
    // TODO: replace with Firestore transaction for strict capacity enforcement
    // Current read-then-write has a small TOCTOU window under concurrent submissions
    if (activeCount >= event.capacity) {
      registrationStatus = 'waitlisted'
    }
  }

  const waitlisted = registrationStatus === 'waitlisted'

  const family: Family = {
    id: familyId,
    org_id: input.orgId,
    event_id: input.eventId,
    org_slug: input.orgSlug,
    event_slug: input.eventSlug,
    event_name: input.eventName,
    org_name: input.orgName,
    ...input.family,
    registration_status: registrationStatus,
    payment_status: 'unpaid',
    registrant_uid: input.registrantUid ?? null,
    pco_household_id: null,
    access_token: null,
    access_token_expires_at: null,
    created_at: now,
    updated_at: now,
  }

  const familyRef = eventRef.collection('families').doc(familyId)
  await familyRef.set(family)

  // Write each family member
  for (const member of input.members) {
    const memberId = buildFamilyId()
    await familyRef
      .collection('family_members').doc(memberId)
      .set({ id: memberId, family_id: familyId, ...member })
  }

  // Best-effort: capture this registration's members onto the registrant's saved profile
  // so they pre-fill next time. Never fail a registration over profile sync.
  if (input.registrantUid && input.members.length > 0) {
    try {
      const profile = await getRegistrantProfile(input.registrantUid)
      if (profile) {
        const merged = mergeSavedMembers(profile.saved_members, input.members, () => buildFamilyId())
        if (merged.length !== profile.saved_members.length) {
          await updateRegistrantProfile(input.registrantUid, { saved_members: merged })
        }
      }
    } catch {
      // ignore — profile sync is non-critical
    }
  }

  // Attach signed URL token
  const accessToken = await attachAccessToken(input.orgId, input.eventId, familyId)

  // Send confirmation email (skipped for paid registrations; sent after payment webhook confirms payment)
  if (!input.skipConfirmationEmail) {
    const fromDomain = await getVerifiedSendingDomain(input.orgId)
    await sendRegistrationConfirmation({
      to: input.family.email,
      firstName: input.family.first_name,
      eventName: input.eventName,
      orgName: input.orgName,
      orgSlug: input.orgSlug,
      eventSlug: input.eventSlug,
      familyId,
      accessToken,
      fromDisplayName: event.from_display_name,
      replyTo: event.reply_to_email,
      fromDomain,
    })
  }

  return { familyId, accessToken, waitlisted }
}

export async function getRegistrationByToken(
  orgId: string,
  eventId: string,
  token: string
): Promise<Family | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('families')
    .where('access_token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) return null

  const family = snap.docs[0].data() as Family

  // Check token expiry
  if (family.access_token_expires_at) {
    const expiry = new Date(family.access_token_expires_at)
    if (expiry < new Date()) return null
  }

  return family
}

export async function getRegistrationByUid(
  orgId: string,
  eventId: string,
  uid: string
): Promise<Family | null> {
  const caller = await getCurrentUser()
  if (!caller) throw new Error('Unauthorized')
  if (caller.uid !== uid) await assertEventPage(orgId, eventId, 'families')

  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
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
  eventId: string,
  familyId: string,
  token?: string
): Promise<FamilyMember[]> {
  await assertFamilyAccess(orgId, eventId, familyId, { token, page: 'families' })
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('families').doc(familyId)
    .collection('family_members')
    .get()

  return snap.docs.map((d) => d.data() as FamilyMember)
}

export async function updateRegistration(
  orgId: string,
  eventId: string,
  familyId: string,
  updates: Partial<Pick<Family,
    'first_name' | 'last_name' | 'email' | 'phone' |
    'address' | 'emergency_contact'
  >>,
  token?: string
): Promise<void> {
  await assertFamilyAccess(orgId, eventId, familyId, { token, page: 'families' })
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('families').doc(familyId)
    .update({ ...updates, updated_at: new Date().toISOString() })
}

export async function linkRegistrantAccount(
  orgId: string,
  eventId: string,
  familyId: string,
  uid: string
): Promise<void> {
  await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('families').doc(familyId)
    .update({ registrant_uid: uid, updated_at: new Date().toISOString() })
}

// A logged-in registrant's prior registrations made under their (verified) profile email
// that aren't yet linked to their account. Email comes from the caller's OWN profile —
// never a parameter — so this can't enumerate other people's registrations.
export async function getClaimableRegistrations(): Promise<Family[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const profile = await getRegistrantProfile(user.uid)
  const email = profile?.email?.trim().toLowerCase()
  if (!email) return []
  const snap = await adminDb.collectionGroup('families').where('email', '==', profile!.email).get()
  return snap.docs
    .map((d) => d.data() as Family)
    .filter((f) => !f.registrant_uid && f.email.trim().toLowerCase() === email)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

// Link an unclaimed family to the caller, only if its email matches the caller's profile email.
export async function claimRegistration(orgId: string, eventId: string, familyId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const profile = await getRegistrantProfile(user.uid)
  const email = profile?.email?.trim().toLowerCase()
  if (!email) throw new Error('Forbidden')
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('families').doc(familyId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Not found')
  const fam = snap.data() as Family
  if (fam.registrant_uid) throw new Error('Forbidden')
  if (fam.email.trim().toLowerCase() !== email) throw new Error('Forbidden')
  await ref.update({ registrant_uid: user.uid, updated_at: new Date().toISOString() })
}
