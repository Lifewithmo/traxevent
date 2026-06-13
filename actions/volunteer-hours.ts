'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { VolunteerHoursEntry } from '@/lib/types'
import { randomBytes } from 'crypto'

function hoursRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('volunteer_hours')
}

export async function listVolunteerHours(orgId: string, campId: string): Promise<VolunteerHoursEntry[]> {
  const snap = await hoursRef(orgId, campId).orderBy('date', 'desc').get()
  return snap.docs.map((d) => d.data() as VolunteerHoursEntry)
}

export interface LogVolunteerHoursInput {
  personId: string
  personName: string
  date: string
  hours: number
  note?: string
}

export async function logVolunteerHours(
  orgId: string,
  campId: string,
  input: LogVolunteerHoursInput
): Promise<VolunteerHoursEntry> {
  const id = randomBytes(8).toString('hex')
  const entry: VolunteerHoursEntry = {
    id,
    person_id: input.personId,
    person_name: input.personName,
    date: input.date,
    hours: input.hours,
    ...(input.note ? { note: input.note } : {}),
    created_at: new Date().toISOString(),
  }
  await hoursRef(orgId, campId).doc(id).set(entry)
  return entry
}

export async function deleteVolunteerHours(orgId: string, campId: string, entryId: string): Promise<void> {
  await hoursRef(orgId, campId).doc(entryId).delete()
}
