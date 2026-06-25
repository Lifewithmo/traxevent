'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { CheckinRecord, EventMember, Family, FamilyMember } from '@/lib/types'
import { assertCampPage } from '@/lib/auth/assert'

function campRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId)
}

function checkinsRef(orgId: string, campId: string) {
  return campRef(orgId, campId).collection('checkins')
}

export async function listAllEventMembers(orgId: string, campId: string): Promise<EventMember[]> {
  await assertCampPage(orgId, campId, 'checkin')
  const familiesSnap = await campRef(orgId, campId).collection('families').get()

  const perFamily = await Promise.all(
    familiesSnap.docs
      .filter((d) => (d.data() as Family).registration_status !== 'cancelled')
      .map(async (familyDoc) => {
        const family = familyDoc.data() as Family
        const membersSnap = await campRef(orgId, campId)
          .collection('families').doc(familyDoc.id)
          .collection('family_members').get()
        return membersSnap.docs.map((memberDoc) => {
          const m = memberDoc.data() as FamilyMember
          return {
            member_id: memberDoc.id,
            family_id: familyDoc.id,
            first_name: m.first_name,
            last_name: m.last_name,
            family_name: family.last_name,
          } as EventMember
        })
      })
  )

  return perFamily.flat()
}

export async function getCheckinsForDate(
  orgId: string,
  campId: string,
  date: string
): Promise<CheckinRecord[]> {
  await assertCampPage(orgId, campId, 'checkin')
  const snap = await checkinsRef(orgId, campId).where('date', '==', date).get()
  return snap.docs.map((d) => d.data() as CheckinRecord)
}

export interface CheckInMemberInput {
  date: string
  memberId: string
  familyId: string
  memberName: string
  checkedInBy?: string
}

export async function checkInMember(
  orgId: string,
  campId: string,
  input: CheckInMemberInput
): Promise<CheckinRecord> {
  await assertCampPage(orgId, campId, 'checkin')
  const id = `${input.date}_${input.memberId}`
  const now = new Date().toISOString()
  const record: CheckinRecord = {
    id,
    date: input.date,
    member_id: input.memberId,
    family_id: input.familyId,
    member_name: input.memberName,
    status: 'in',
    checked_in_at: now,
    ...(input.checkedInBy ? { checked_in_by: input.checkedInBy } : {}),
  }
  // Deterministic id makes check-in idempotent; re-checking in after a checkout
  // intentionally resets the record to 'in' (e.g. a child who left and returned).
  await checkinsRef(orgId, campId).doc(id).set(record)
  return record
}

export async function checkOutMember(
  orgId: string,
  campId: string,
  recordId: string,
  guardianPickupName?: string
): Promise<void> {
  await assertCampPage(orgId, campId, 'checkin')
  const ref = checkinsRef(orgId, campId).doc(recordId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Check-in record not found')
  await ref.update({
    status: 'out',
    checked_out_at: new Date().toISOString(),
    ...(guardianPickupName ? { guardian_pickup_name: guardianPickupName } : {}),
  })
}

export interface CheckinSummary {
  checkedIn: number
  checkedOut: number
  total: number
}

export async function getCheckinSummary(
  orgId: string,
  campId: string,
  date: string
): Promise<CheckinSummary> {
  await assertCampPage(orgId, campId, 'checkin')
  const snap = await checkinsRef(orgId, campId).where('date', '==', date).get()
  let checkedIn = 0
  let checkedOut = 0
  snap.docs.forEach((d) => {
    const status = (d.data() as CheckinRecord).status
    if (status === 'in') checkedIn++
    else if (status === 'out') checkedOut++
  })
  return { checkedIn, checkedOut, total: snap.docs.length }
}
