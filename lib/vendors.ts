import type { Vendor, VendorStatus } from '@/lib/types'

export const VENDOR_STATUSES: VendorStatus[] = ['potential', 'confirmed', 'declined']

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  potential: 'Potential',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

// `tone` prop values of the shared kit's StatusPill.
export const VENDOR_STATUS_TONE: Record<VendorStatus, 'confirmed' | 'pending' | 'neutral'> = {
  potential: 'pending',
  confirmed: 'confirmed',
  declined: 'neutral',
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

// ── Vendor ledger ─────────────────────────────────────────────────────

/** A vendor joined to its lead's display name. */
export interface VendorLedgerRow extends Vendor {
  clientName: string
}

export interface VendorLedgerGroup {
  key: VendorStatus
  label: string
  rows: VendorLedgerRow[]
  subtotal: number
}

export interface VendorLedgerTiles {
  committed: number
  estimated: number
  toConfirmCount: number
  toConfirmValue: number
}

export interface VendorLedger {
  tiles: VendorLedgerTiles
  groups: VendorLedgerGroup[]
  total: number
}

/**
 * Group headers, not status nouns: the potential group is the operator's to-do,
 * so it reads as an action. VENDOR_STATUS_LABELS stays the pill/<select> wording.
 */
const VENDOR_GROUP_LABELS: Record<VendorStatus, string> = {
  ...VENDOR_STATUS_LABELS,
  potential: 'To confirm',
}

// Decision-first: what still needs a call comes before what's settled.
const VENDOR_GROUP_ORDER: VendorStatus[] = ['potential', 'confirmed', 'declined']

function sumCost(rows: VendorLedgerRow[]): number {
  return round2(rows.reduce((sum, r) => sum + (r.cost ?? 0), 0))
}

export function buildVendorLedger(rows: VendorLedgerRow[]): VendorLedger {
  const potential = rows.filter((r) => r.status === 'potential')

  const groups = VENDOR_GROUP_ORDER.map((key) => {
    // Biggest money first; name breaks ties so the order never shuffles between renders.
    const groupRows = rows
      .filter((r) => r.status === key)
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.name.localeCompare(b.name, 'en'))
    return { key, label: VENDOR_GROUP_LABELS[key], rows: groupRows, subtotal: sumCost(groupRows) }
  }).filter((g) => g.rows.length > 0)

  return {
    tiles: {
      committed: confirmedVendorCost(rows),
      estimated: totalVendorCost(rows),
      toConfirmCount: potential.length,
      toConfirmValue: sumCost(potential),
    },
    groups,
    total: rows.length,
  }
}
