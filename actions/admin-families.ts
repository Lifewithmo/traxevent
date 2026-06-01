'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Family, FamilyMember, FamilyNote, FamilyCsvRow } from '@/lib/types'
import { randomBytes } from 'crypto'
import { exportFamiliesCsv } from '@/lib/csv'

function familiesRef(orgId: string, campId: string) {
  return adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
}

export async function getAdminFamilies(orgId: string, campId: string): Promise<Family[]> {
  const snap = await familiesRef(orgId, campId).orderBy('created_at', 'desc').get()
  return snap.docs.map(d => d.data() as Family)
}

export async function getAdminFamily(
  orgId: string,
  campId: string,
  familyId: string
): Promise<{ family: Family; members: FamilyMember[] } | null> {
  const familySnap = await familiesRef(orgId, campId).doc(familyId).get()
  if (!familySnap.exists) return null
  const membersSnap = await familiesRef(orgId, campId)
    .doc(familyId)
    .collection('family_members')
    .get()
  return {
    family: familySnap.data() as Family,
    members: membersSnap.docs.map(d => d.data() as FamilyMember),
  }
}

export async function updateAdminFamily(
  orgId: string,
  campId: string,
  familyId: string,
  updates: Partial<Pick<Family,
    | 'first_name' | 'last_name' | 'email' | 'phone'
    | 'address' | 'emergency_contact'
    | 'amount_due' | 'amount_paid' | 'payment_notes' | 'payment_status'
  >>
): Promise<void> {
  await familiesRef(orgId, campId).doc(familyId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function updateFamilyStatus(
  orgId: string,
  campId: string,
  familyId: string,
  status: Family['registration_status'],
  adminName: string
): Promise<void> {
  const note: FamilyNote = {
    id: randomBytes(8).toString('hex'),
    text: `Status changed to ${status}`,
    author: adminName,
    created_at: new Date().toISOString(),
    type: 'system',
  }
  const snap = await familiesRef(orgId, campId).doc(familyId).get()
  const existing = ((snap.data() as Family).notes) ?? []
  await familiesRef(orgId, campId).doc(familyId).update({
    registration_status: status,
    notes: [...existing, note],
    updated_at: new Date().toISOString(),
  })
}

export async function bulkUpdateStatus(
  orgId: string,
  campId: string,
  familyIds: string[],
  status: Family['registration_status'],
  adminName: string
): Promise<void> {
  await Promise.all(
    familyIds.map(id => updateFamilyStatus(orgId, campId, id, status, adminName))
  )
}

export async function addFamilyNote(
  orgId: string,
  campId: string,
  familyId: string,
  text: string,
  author: string
): Promise<FamilyNote> {
  const note: FamilyNote = {
    id: randomBytes(8).toString('hex'),
    text,
    author,
    created_at: new Date().toISOString(),
    type: 'admin',
  }
  const snap = await familiesRef(orgId, campId).doc(familyId).get()
  const existing = ((snap.data() as Family).notes) ?? []
  await familiesRef(orgId, campId).doc(familyId).update({
    notes: [...existing, note],
    updated_at: new Date().toISOString(),
  })
  return note
}

export async function updateFamilyMembers(
  orgId: string,
  campId: string,
  familyId: string,
  members: FamilyMember[]
): Promise<void> {
  const batch = adminDb.batch()
  const membersCol = familiesRef(orgId, campId).doc(familyId).collection('family_members')
  const existingSnap = await membersCol.get()
  existingSnap.docs.forEach(d => batch.delete(d.ref))
  members.forEach(m => batch.set(membersCol.doc(m.id), m))
  await batch.commit()
}

export async function buildFamiliesCsvAction(
  orgId: string,
  campId: string,
  familyIds?: string[]
): Promise<string> {
  const families = await getAdminFamilies(orgId, campId)
  const filtered = familyIds ? families.filter(f => familyIds.includes(f.id)) : families

  const membersMap = new Map<string, FamilyMember[]>()
  await Promise.all(
    filtered.map(async f => {
      const snap = await familiesRef(orgId, campId)
        .doc(f.id)
        .collection('family_members')
        .get()
      membersMap.set(f.id, snap.docs.map(d => d.data() as FamilyMember))
    })
  )

  const rows: FamilyCsvRow[] = filtered.map(f => {
    const members = membersMap.get(f.id) ?? []
    const balance = ((f.amount_due ?? 0) - (f.amount_paid ?? 0)).toFixed(2)
    return {
      familyName: `${f.last_name}, ${f.first_name}`,
      email: f.email,
      phone: f.phone,
      campers: members.map(m => m.first_name).join('; '),
      status: f.registration_status,
      balance: `$${balance}`,
      submitted: f.created_at.split('T')[0],
    }
  })

  return exportFamiliesCsv(rows)
}
