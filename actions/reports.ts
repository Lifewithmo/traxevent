'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertCampPage, assertOrgMember, assertNetworkAdmin } from '@/lib/auth/assert'
import type { Family, FamilyMember, EventFormAssignment, Camp, Org } from '@/lib/types'
import { summarizeFormCompletion, type FormCompletionRow } from '@/lib/forms'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  buildDietaryAllergyReport,
  buildMedicalReport,
  buildTshirtReport,
  buildCustomCsv,
  buildOrgCampRow,
  aggregateOrgReport,
  aggregateNetworkReport,
  type NetworkReport,
  type NetworkOrgReport,
  type MemberWithFamily,
  type RegistrationSummary,
  type FinancialReport,
  type DietaryAllergyRow,
  type MedicalRow,
  type TshirtReport,
  type CustomReportField,
  type OrgReport,
} from '@/lib/reports'

function familiesRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('families')
}

// Loads ALL families (for status/financial summaries which should count cancellations)
// and flattens members of NON-cancelled families with family context.
async function loadFamiliesAndMembers(
  orgId: string,
  campId: string
): Promise<{ families: Family[]; members: MemberWithFamily[] }> {
  const familiesSnap = await familiesRef(orgId, campId).orderBy('created_at', 'desc').get()
  const families = familiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Family)
  const active = families.filter((f) => f.registration_status !== 'cancelled')

  const perFamily = await Promise.all(
    active.map(async (f) => {
      const snap = await familiesRef(orgId, campId).doc(f.id).collection('family_members').get()
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

export async function getEventReportData(orgId: string, campId: string): Promise<EventReportData> {
  await assertCampPage(orgId, campId, 'reports')
  const { families, members } = await loadFamiliesAndMembers(orgId, campId)
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
  campId: string,
  fields: CustomReportField[]
): Promise<string> {
  await assertCampPage(orgId, campId, 'reports')
  const { members } = await loadFamiliesAndMembers(orgId, campId)
  return buildCustomCsv(members, fields)
}

export async function getFormSubmissionReport(orgId: string, campId: string): Promise<FormCompletionRow[]> {
  await assertCampPage(orgId, campId, 'reports')
  const campRef = adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId)

  const [familiesSnap, assignmentsSnap, signedSnap] = await Promise.all([
    campRef.collection('families').get(),
    campRef.collection('form_assignments').get(),
    adminDb
      .collectionGroup('signed_forms')
      .where('org_id', '==', orgId)
      .where('camp_id', '==', campId)
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
  const campsSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .orderBy('created_at', 'desc')
    .get()

  let camps = campsSnap.docs.map((d) => d.data() as Camp)
  if (departmentId) camps = camps.filter((c) => c.department_id === departmentId)

  const rows = await Promise.all(
    camps.map(async (camp) => {
      const famSnap = await adminDb
        .collection('orgs').doc(orgId)
        .collection('camps').doc(camp.id)
        .collection('families')
        .get()
      const families = famSnap.docs
        .map((d) => d.data() as Family)
        .filter((f) => f.registration_status !== 'cancelled')
      return buildOrgCampRow(camp, families)
    })
  )

  return aggregateOrgReport(rows)
}

// Aggregated report across a network's member orgs. Gated by NETWORK admin (not per-org membership).
export async function getNetworkReportData(networkId: string): Promise<NetworkReport> {
  await assertNetworkAdmin(networkId)
  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  const orgs = orgsSnap.docs.map((d) => ({ ...(d.data() as Org), id: d.id }))

  const perOrg: NetworkOrgReport[] = await Promise.all(
    orgs.map(async (org) => {
      const campsSnap = await adminDb.collection('orgs').doc(org.id).collection('camps').orderBy('created_at', 'desc').get()
      const camps = campsSnap.docs.map((d) => d.data() as Camp)
      const rows = await Promise.all(
        camps.map(async (camp) => {
          const famSnap = await adminDb.collection('orgs').doc(org.id).collection('camps').doc(camp.id).collection('families').get()
          const families = famSnap.docs.map((d) => d.data() as Family).filter((f) => f.registration_status !== 'cancelled')
          return buildOrgCampRow(camp, families)
        })
      )
      return { org_id: org.id, org_name: org.name, report: aggregateOrgReport(rows) }
    })
  )

  return aggregateNetworkReport(perOrg)
}
