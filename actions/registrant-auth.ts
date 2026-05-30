'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { RegistrantProfile, SavedFamilyMember } from '@/lib/types'
import { randomBytes } from 'crypto'

export function buildEmptyProfile(
  uid: string,
  email: string,
  displayName: string
): RegistrantProfile {
  const now = new Date().toISOString()
  return {
    uid,
    display_name: displayName,
    email,
    phone: '',
    address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
    saved_members: [],
    created_at: now,
    updated_at: now,
  }
}

export async function createRegistrantProfile(
  uid: string,
  email: string,
  displayName: string
): Promise<RegistrantProfile> {
  const profile = buildEmptyProfile(uid, email, displayName)
  await adminDb.collection('registrant_profiles').doc(uid).set(profile)
  return profile
}

export async function getRegistrantProfile(
  uid: string
): Promise<RegistrantProfile | null> {
  const snap = await adminDb.collection('registrant_profiles').doc(uid).get()
  return snap.exists ? (snap.data() as RegistrantProfile) : null
}

export async function updateRegistrantProfile(
  uid: string,
  updates: Partial<Omit<RegistrantProfile, 'uid' | 'created_at' | 'updated_at'>>
): Promise<void> {
  await adminDb
    .collection('registrant_profiles')
    .doc(uid)
    .update({ ...updates, updated_at: new Date().toISOString() })
}

export async function upsertSavedMember(
  uid: string,
  member: Omit<SavedFamilyMember, 'id'>
): Promise<SavedFamilyMember> {
  const profile = await getRegistrantProfile(uid)
  if (!profile) throw new Error('Profile not found')

  const newMember: SavedFamilyMember = {
    id: randomBytes(8).toString('hex'),
    ...member,
  }

  const saved_members = [...profile.saved_members, newMember]
  await adminDb
    .collection('registrant_profiles')
    .doc(uid)
    .update({ saved_members, updated_at: new Date().toISOString() })

  return newMember
}

export async function deleteSavedMember(uid: string, memberId: string): Promise<void> {
  const profile = await getRegistrantProfile(uid)
  if (!profile) throw new Error('Profile not found')

  const saved_members = profile.saved_members.filter((m) => m.id !== memberId)
  await adminDb
    .collection('registrant_profiles')
    .doc(uid)
    .update({ saved_members, updated_at: new Date().toISOString() })
}
