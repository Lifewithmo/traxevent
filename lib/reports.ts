import type { Family, FamilyMember } from '@/lib/types'

// A FamilyMember flattened with its family's context, for member-level reports.
export interface MemberWithFamily extends FamilyMember {
  family_last_name: string
  family_first_name: string
  email: string
  phone: string
  registration_status: string
  payment_status: string
  amount_due: number
  amount_paid: number
}

export interface RegistrationSummary {
  total: number
  byStatus: Record<string, number>
  byPaymentStatus: Record<string, number>
}

export interface FinancialReport {
  totalDue: number
  totalPaid: number
  outstanding: number
  paidCount: number
  partialCount: number
  unpaidCount: number
  waivedCount: number
}

export interface DietaryAllergyRow {
  name: string
  allergies: string
  dietary_restrictions: string
}

export interface MedicalRow {
  name: string
  medical_notes: string
}

export interface TshirtReport {
  bySize: Record<string, number>
  total: number
}

export function buildRegistrationSummary(families: Family[]): RegistrationSummary {
  const byStatus: Record<string, number> = {}
  const byPaymentStatus: Record<string, number> = {}
  for (const f of families) {
    byStatus[f.registration_status] = (byStatus[f.registration_status] ?? 0) + 1
    byPaymentStatus[f.payment_status] = (byPaymentStatus[f.payment_status] ?? 0) + 1
  }
  return { total: families.length, byStatus, byPaymentStatus }
}

export function buildFinancialReport(families: Family[]): FinancialReport {
  let totalDue = 0
  let totalPaid = 0
  let outstanding = 0
  let paidCount = 0
  let partialCount = 0
  let unpaidCount = 0
  let waivedCount = 0

  for (const f of families) {
    const due = f.amount_due ?? 0
    const paid = f.amount_paid ?? 0
    totalDue += due
    totalPaid += paid

    // Waived balances are not "outstanding" — the org chose not to collect them.
    if (f.payment_status !== 'waived') {
      const bal = due - paid
      if (bal > 0) outstanding += bal
    }

    if (f.payment_status === 'paid') paidCount++
    else if (f.payment_status === 'partial') partialCount++
    else if (f.payment_status === 'unpaid') unpaidCount++
    else if (f.payment_status === 'waived') waivedCount++
  }

  return { totalDue, totalPaid, outstanding, paidCount, partialCount, unpaidCount, waivedCount }
}

function memberName(m: MemberWithFamily): string {
  return `${m.first_name} ${m.last_name}`.trim()
}

export function buildDietaryAllergyReport(members: MemberWithFamily[]): DietaryAllergyRow[] {
  return members
    .filter((m) => m.allergies.trim() || m.dietary_restrictions.trim())
    .map((m) => ({
      name: memberName(m),
      allergies: m.allergies,
      dietary_restrictions: m.dietary_restrictions,
    }))
}

export function buildMedicalReport(members: MemberWithFamily[]): MedicalRow[] {
  return members
    .filter((m) => m.medical_notes.trim())
    .map((m) => ({ name: memberName(m), medical_notes: m.medical_notes }))
}

export function buildTshirtReport(members: MemberWithFamily[]): TshirtReport {
  const bySize: Record<string, number> = {}
  let total = 0
  for (const m of members) {
    const size = m.tshirt_size.trim()
    if (!size) continue
    bySize[size] = (bySize[size] ?? 0) + 1
    total++
  }
  return { bySize, total }
}

export const CUSTOM_REPORT_FIELDS = [
  'family_last_name',
  'family_first_name',
  'email',
  'phone',
  'registration_status',
  'payment_status',
  'amount_due',
  'amount_paid',
  'balance',
  'member_first_name',
  'member_last_name',
  'birth_year',
  'gender',
  'grade',
  'allergies',
  'dietary_restrictions',
  'tshirt_size',
  'medical_notes',
] as const

export type CustomReportField = (typeof CUSTOM_REPORT_FIELDS)[number]

function fieldValue(m: MemberWithFamily, field: CustomReportField): string {
  switch (field) {
    case 'family_last_name': return m.family_last_name
    case 'family_first_name': return m.family_first_name
    case 'email': return m.email
    case 'phone': return m.phone
    case 'registration_status': return m.registration_status
    case 'payment_status': return m.payment_status
    case 'amount_due': return String(m.amount_due)
    case 'amount_paid': return String(m.amount_paid)
    case 'balance': return String(m.amount_due - m.amount_paid)
    case 'member_first_name': return m.first_name
    case 'member_last_name': return m.last_name
    case 'birth_year': return String(m.birth_year)
    case 'gender': return m.gender
    case 'grade': return m.grade
    case 'allergies': return m.allergies
    case 'dietary_restrictions': return m.dietary_restrictions
    case 'tshirt_size': return m.tshirt_size
    case 'medical_notes': return m.medical_notes
  }
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

export function buildCustomCsv(members: MemberWithFamily[], fields: CustomReportField[]): string {
  const header = fields.map((f) => csvEscape(f)).join(',')
  if (members.length === 0) return header
  const lines = members.map((m) => fields.map((f) => csvEscape(fieldValue(m, f))).join(','))
  return [header, ...lines].join('\n')
}

export interface OrgCampReportRow {
  camp_id: string
  camp_name: string
  year: number
  status: string
  department_id: string | null
  registrants: number
  confirmed: number
  pending: number
  waitlisted: number
  totalDue: number
  totalPaid: number
  outstanding: number
}

export interface OrgReport {
  rows: OrgCampReportRow[]
  totals: {
    camps: number
    registrants: number
    confirmed: number
    totalDue: number
    totalPaid: number
    outstanding: number
  }
}

// Collapse one camp's active families into a single report row. `families` should
// already exclude cancelled registrations (the action filters them out).
export function buildOrgCampRow(
  camp: { id: string; name: string; year: number; status: string; department_id?: string | null },
  families: Family[]
): OrgCampReportRow {
  const summary = buildRegistrationSummary(families)
  const fin = buildFinancialReport(families)
  return {
    camp_id: camp.id,
    camp_name: camp.name,
    year: camp.year,
    status: camp.status,
    department_id: camp.department_id ?? null,
    registrants: summary.total,
    confirmed: summary.byStatus['confirmed'] ?? 0,
    pending: summary.byStatus['pending'] ?? 0,
    waitlisted: summary.byStatus['waitlisted'] ?? 0,
    totalDue: fin.totalDue,
    totalPaid: fin.totalPaid,
    outstanding: fin.outstanding,
  }
}

export function aggregateOrgReport(rows: OrgCampReportRow[]): OrgReport {
  const totals = rows.reduce(
    (acc, r) => ({
      camps: acc.camps + 1,
      registrants: acc.registrants + r.registrants,
      confirmed: acc.confirmed + r.confirmed,
      totalDue: acc.totalDue + r.totalDue,
      totalPaid: acc.totalPaid + r.totalPaid,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { camps: 0, registrants: 0, confirmed: 0, totalDue: 0, totalPaid: 0, outstanding: 0 }
  )
  return { rows, totals }
}
