'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Family, FamilyMember } from '@/lib/types'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  buildDietaryAllergyReport,
  buildMedicalReport,
  buildTshirtReport,
  buildCustomCsv,
  type MemberWithFamily,
  type RegistrationSummary,
  type FinancialReport,
  type DietaryAllergyRow,
  type MedicalRow,
  type TshirtReport,
  type CustomReportField,
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
  const { members } = await loadFamiliesAndMembers(orgId, campId)
  return buildCustomCsv(members, fields)
}
