import type { Vendor, VendorStatus } from '@/lib/types'

export const VENDOR_STATUSES: VendorStatus[] = ['potential', 'confirmed', 'declined']

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  potential: 'Potential',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Committed spend: cost of confirmed vendors only.
export function confirmedVendorCost(vendors: Vendor[]): number {
  return round2(vendors.filter((v) => v.status === 'confirmed').reduce((sum, v) => sum + (v.cost ?? 0), 0))
}

// Cost across all non-declined vendors (confirmed + potential).
export function totalVendorCost(vendors: Vendor[]): number {
  return round2(vendors.filter((v) => v.status !== 'declined').reduce((sum, v) => sum + (v.cost ?? 0), 0))
}
