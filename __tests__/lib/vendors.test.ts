import { describe, it, expect } from 'vitest'
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS, confirmedVendorCost, totalVendorCost } from '@/lib/vendors'
import type { Vendor } from '@/lib/types'

const v = (status: Vendor['status'], cost?: number): Vendor =>
  ({ id: 'x', lead_id: 'l', name: 'n', status, created_at: '', ...(cost != null ? { cost } : {}) }) as Vendor

describe('VENDOR_STATUSES', () => {
  it('is the three statuses with labels', () => {
    expect(VENDOR_STATUSES).toEqual(['potential', 'confirmed', 'declined'])
    for (const s of VENDOR_STATUSES) expect(VENDOR_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('confirmedVendorCost', () => {
  it('sums cost of confirmed vendors only, rounded to cents', () => {
    expect(confirmedVendorCost([v('confirmed', 1200), v('potential', 500), v('confirmed', 45.5), v('declined', 999)])).toBe(1245.5)
    expect(confirmedVendorCost([v('potential', 500)])).toBe(0)
  })
})

describe('totalVendorCost', () => {
  it('sums cost across all non-declined vendors', () => {
    expect(totalVendorCost([v('confirmed', 1200), v('potential', 500), v('declined', 999)])).toBe(1700)
    expect(totalVendorCost([])).toBe(0)
  })
})
