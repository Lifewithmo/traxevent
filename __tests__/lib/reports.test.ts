import { describe, it, expect } from 'vitest'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  buildDietaryAllergyReport,
  buildMedicalReport,
  buildTshirtReport,
  buildCustomCsv,
  CUSTOM_REPORT_FIELDS,
  type MemberWithFamily,
} from '@/lib/reports'
import type { Family } from '@/lib/types'

function fam(overrides: Partial<Family>): Family {
  return {
    id: 'f1', org_id: 'o', camp_id: 'c', org_slug: 'o', camp_slug: 'c',
    camp_name: 'Camp', org_name: 'Org', first_name: 'Jane', last_name: 'Smith',
    email: 'jane@example.com', phone: '555', address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
    registration_status: 'confirmed', payment_status: 'paid',
    registrant_uid: null, pco_household_id: null, access_token: null, access_token_expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mem(overrides: Partial<MemberWithFamily>): MemberWithFamily {
  return {
    id: 'm1', family_id: 'f1', first_name: 'Ann', last_name: 'Smith',
    birth_year: 2015, gender: 'F', grade: '4', allergies: '', dietary_restrictions: '',
    tshirt_size: '', medical_notes: '',
    family_last_name: 'Smith', family_first_name: 'Jane', email: 'jane@example.com', phone: '555',
    registration_status: 'confirmed', payment_status: 'paid', amount_due: 0, amount_paid: 0,
    ...overrides,
  }
}

describe('buildRegistrationSummary', () => {
  it('counts families by registration status and payment status', () => {
    const families = [
      fam({ registration_status: 'confirmed', payment_status: 'paid' }),
      fam({ registration_status: 'confirmed', payment_status: 'unpaid' }),
      fam({ registration_status: 'pending', payment_status: 'unpaid' }),
      fam({ registration_status: 'cancelled', payment_status: 'unpaid' }),
    ]
    const s = buildRegistrationSummary(families)
    expect(s.total).toBe(4)
    expect(s.byStatus).toEqual({ confirmed: 2, pending: 1, cancelled: 1 })
    expect(s.byPaymentStatus).toEqual({ paid: 1, unpaid: 3 })
  })

  it('returns zeroed summary for no families', () => {
    const s = buildRegistrationSummary([])
    expect(s.total).toBe(0)
    expect(s.byStatus).toEqual({})
    expect(s.byPaymentStatus).toEqual({})
  })
})

describe('buildFinancialReport', () => {
  it('sums due/paid and computes outstanding + status counts', () => {
    const families = [
      fam({ payment_status: 'paid', amount_due: 100, amount_paid: 100 }),
      fam({ payment_status: 'partial', amount_due: 100, amount_paid: 40 }),
      fam({ payment_status: 'unpaid', amount_due: 100, amount_paid: 0 }),
      fam({ payment_status: 'waived', amount_due: 100, amount_paid: 0 }),
    ]
    const r = buildFinancialReport(families)
    expect(r.totalDue).toBe(400)
    expect(r.totalPaid).toBe(140)
    expect(r.outstanding).toBe(160)
    expect(r.paidCount).toBe(1)
    expect(r.partialCount).toBe(1)
    expect(r.unpaidCount).toBe(1)
    expect(r.waivedCount).toBe(1)
  })

  it('treats missing amounts as zero', () => {
    const r = buildFinancialReport([fam({ payment_status: 'unpaid' })])
    expect(r.totalDue).toBe(0)
    expect(r.totalPaid).toBe(0)
    expect(r.outstanding).toBe(0)
  })
})

describe('buildDietaryAllergyReport', () => {
  it('includes only members with allergies or dietary restrictions', () => {
    const members = [
      mem({ first_name: 'Ann', allergies: 'Peanuts', dietary_restrictions: '' }),
      mem({ first_name: 'Bo', allergies: '', dietary_restrictions: 'Vegetarian' }),
      mem({ first_name: 'Cy', allergies: '', dietary_restrictions: '' }),
    ]
    const rows = buildDietaryAllergyReport(members)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: 'Ann Smith', allergies: 'Peanuts', dietary_restrictions: '' })
    expect(rows[1]).toEqual({ name: 'Bo Smith', allergies: '', dietary_restrictions: 'Vegetarian' })
  })
})

describe('buildMedicalReport', () => {
  it('includes only members with medical notes', () => {
    const members = [
      mem({ first_name: 'Ann', medical_notes: 'Inhaler' }),
      mem({ first_name: 'Bo', medical_notes: '' }),
    ]
    const rows = buildMedicalReport(members)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ name: 'Ann Smith', medical_notes: 'Inhaler' })
  })
})

describe('buildTshirtReport', () => {
  it('counts members by t-shirt size, ignoring blanks', () => {
    const members = [
      mem({ tshirt_size: 'M' }),
      mem({ tshirt_size: 'M' }),
      mem({ tshirt_size: 'L' }),
      mem({ tshirt_size: '' }),
    ]
    const r = buildTshirtReport(members)
    expect(r.bySize).toEqual({ M: 2, L: 1 })
    expect(r.total).toBe(3)
  })
})

describe('buildCustomCsv', () => {
  it('emits a header and one row per member for selected fields', () => {
    const members = [
      mem({ first_name: 'Ann', last_name: 'Smith', tshirt_size: 'M', allergies: 'Peanuts' }),
    ]
    const csv = buildCustomCsv(members, ['member_first_name', 'member_last_name', 'tshirt_size', 'allergies'])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('"member_first_name","member_last_name","tshirt_size","allergies"')
    expect(lines[1]).toBe('"Ann","Smith","M","Peanuts"')
  })

  it('computes the balance field as amount_due minus amount_paid', () => {
    const members = [mem({ amount_due: 100, amount_paid: 30 })]
    const csv = buildCustomCsv(members, ['balance'])
    expect(csv.split('\n')[1]).toBe('"70"')
  })

  it('escapes embedded double-quotes', () => {
    const members = [mem({ medical_notes: 'Says "ouch"' })]
    const csv = buildCustomCsv(members, ['medical_notes'])
    expect(csv.split('\n')[1]).toBe('"Says ""ouch"""')
  })

  it('returns only the header when there are no members', () => {
    const csv = buildCustomCsv([], ['member_first_name'])
    expect(csv).toBe('"member_first_name"')
  })

  it('CUSTOM_REPORT_FIELDS includes the documented selectable fields', () => {
    expect(CUSTOM_REPORT_FIELDS).toContain('tshirt_size')
    expect(CUSTOM_REPORT_FIELDS).toContain('balance')
    expect(CUSTOM_REPORT_FIELDS).toContain('member_first_name')
    expect(CUSTOM_REPORT_FIELDS).toContain('registration_status')
  })
})
