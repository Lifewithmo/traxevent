'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertEventPage, assertOrgMember } from '@/lib/auth/assert'
import type { Family, FamilyMember, EventFormAssignment, Event } from '@/lib/types'
import { summarizeFormCompletion, type FormCompletionRow } from '@/lib/forms'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  buildDietaryAllergyReport,
  buildMedicalReport,
  buildTshirtReport,
  buildCustomCsv,
  buildOrgEventRow,
  aggregateOrgReport,
  type MemberWithFamily,
  type RegistrationSummary,
  type FinancialReport,
  type DietaryAllergyRow,
  type MedicalRow,
  type TshirtReport,
  type CustomReportField,
  type OrgReport,
} from '@/lib/reports'

function familiesRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('families')
}

// Loads ALL families (for status/financial summaries which should count cancellations)
// and flattens members of NON-cancelled families with family context.
async function loadFamiliesAndMembers(
  orgId: string,
  eventId: string
): Promise<{ families: Family[]; members: MemberWithFamily[] }> {
  const familiesSnap = await familiesRef(orgId, eventId).orderBy('created_at', 'desc').get()
  const families = familiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Family)
  const active = families.filter((f) => f.registration_status !== 'cancelled')

  const perFamily = await Promise.all(
    active.map(async (f) => {
      const snap = await familiesRef(orgId, eventId).doc(f.id).collection('family_members').get()
      return snap.docs.map((d) => {
        const m = { id: d.id, ...d.data() } as FamilyMember
        const row: MemberWithFamily = {
          ...m,
          first_name: m.first_name ?? '',
          last_name: m.last_name ?? '',
          birth_year: m.birth_year ?? 0,
          gender: m.gender ?? '',
          grade: m.grade ?? '',
          allergies: m.allergies ?? '',
          dietary_restrictions: m.dietary_restrictions ?? '',
          tshirt_size: m.tshirt_size ?? '',
          medical_notes: m.medical_notes ?? '',
          family_last_name: f.last_name,
          family_first_name: f.first_name,
          email: f.email,
          phone: f.phone,
          registration_status: f.registration_status,
          payment_status: f.payment_status,
          amount_due: f.amount_due ?? 0,
          amount_paid: f.amount_paid ?? 0,
        }
        return row
      })
    })
  )

  return { families, members: perFamily.flat() }
}

export interface EventReportData {
  summary: RegistrationSummary
  financial: FinancialReport
  dietary: DietaryAllergyRow[]
  medical: MedicalRow[]
  tshirt: TshirtReport
}

export async function getEventReportData(orgId: string, eventId: string): Promise<EventReportData> {
  await assertEventPage(orgId, eventId, 'reports')
  const { families, members } = await loadFamiliesAndMembers(orgId, eventId)
  return {
    summary: buildRegistrationSummary(families),
    financial: buildFinancialReport(families),
    dietary: buildDietaryAllergyReport(members),
    medical: buildMedicalReport(members),
    tshirt: buildTshirtReport(members),
  }
}

export async function buildCustomReportCsv(
  orgId: string,
  eventId: string,
  fields: CustomReportField[]
): Promise<string> {
  await assertEventPage(orgId, eventId, 'reports')
  const { members } = await loadFamiliesAndMembers(orgId, eventId)
  return buildCustomCsv(members, fields)
}

export async function getFormSubmissionReport(orgId: string, eventId: string): Promise<FormCompletionRow[]> {
  await assertEventPage(orgId, eventId, 'reports')
  const eventRef = adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId)

  const [familiesSnap, assignmentsSnap, signedSnap] = await Promise.all([
    eventRef.collection('families').get(),
    eventRef.collection('form_assignments').get(),
    adminDb
      .collectionGroup('signed_forms')
      .where('org_id', '==', orgId)
      .where('event_id', '==', eventId)
      .get(),
  ])

  const families = familiesSnap.docs
    .map((d) => d.data() as Family)
    .filter((f) => f.registration_status !== 'cancelled')
    .map((f) => ({
      family_id: f.id,
      name: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim(),
      email: f.email,
    }))

  const assignments = assignmentsSnap.docs.map((d) => d.data() as EventFormAssignment)

  // Build `${familyId}:${assignmentId}` keys. signed_forms live under
  // families/{familyId}/signed_forms, so the family id is the grandparent doc id.
  const signedKeys = new Set<string>()
  for (const doc of signedSnap.docs) {
    const familyId = doc.ref.parent.parent?.id
    const assignmentId = (doc.data() as { assignment_id?: string }).assignment_id
    if (familyId && assignmentId) signedKeys.add(`${familyId}:${assignmentId}`)
  }

  return summarizeFormCompletion(families, assignments, signedKeys)
}

export async function getOrgReportData(orgId: string, departmentId?: string): Promise<OrgReport> {
  await assertOrgMember(orgId)
  const eventsSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events')
    .orderBy('created_at', 'desc')
    .get()

  let events = eventsSnap.docs.map((d) => d.data() as Event)
  if (departmentId) events = events.filter((c) => c.department_id === departmentId)

  const rows = await Promise.all(
    events.map(async (event) => {
      const famSnap = await adminDb
        .collection('orgs').doc(orgId)
        .collection('events').doc(event.id)
        .collection('families')
        .get()
      const families = famSnap.docs
        .map((d) => d.data() as Family)
        .filter((f) => f.registration_status !== 'cancelled')
      return buildOrgEventRow(event, families)
    })
  )

  return aggregateOrgReport(rows)
}
