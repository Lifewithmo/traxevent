import { describe, it, expect } from 'vitest'
import {
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONE,
  buildVendorLedger,
  confirmedVendorCost,
  totalVendorCost,
  type VendorLedgerRow,
} from '@/lib/vendors'
import type { Vendor } from '@/lib/types'

const v = (status: Vendor['status'], cost?: number): Vendor =>
  ({ id: 'x', lead_id: 'l', name: 'n', status, created_at: '', ...(cost != null ? { cost } : {}) }) as Vendor

const row = (name: string, status: Vendor['status'], cost?: number, clientName = 'Acme'): VendorLedgerRow => ({
  id: `${name}-${status}`,
  lead_id: 'l',
  name,
  status,
  created_at: '',
  clientName,
  ...(cost != null ? { cost } : {}),
})

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

describe('VENDOR_STATUS_TONE', () => {
  it('maps every status to a StatusPill tone', () => {
    expect(VENDOR_STATUS_TONE).toEqual({ confirmed: 'confirmed', potential: 'pending', declined: 'neutral' })
    for (const s of VENDOR_STATUSES) expect(VENDOR_STATUS_TONE[s]).toBeTruthy()
  })
})

describe('buildVendorLedger', () => {
  it('returns an empty ledger for empty input', () => {
    expect(buildVendorLedger([])).toEqual({
      tiles: { committed: 0, estimated: 0, toConfirmCount: 0, toConfirmValue: 0 },
      groups: [],
      total: 0,
    })
  })

  it('orders groups decision-first: to confirm, confirmed, declined', () => {
    const ledger = buildVendorLedger([
      row('A', 'declined', 10),
      row('B', 'confirmed', 20),
      row('C', 'potential', 30),
    ])
    expect(ledger.groups.map((g) => g.key)).toEqual(['potential', 'confirmed', 'declined'])
    expect(ledger.groups.map((g) => g.label)).toEqual(['To confirm', 'Confirmed', 'Declined'])
    // The status noun stays intact for pills and the create-form <select>.
    expect(VENDOR_STATUS_LABELS.potential).toBe('Potential')
  })

  it('omits empty groups entirely', () => {
    const ledger = buildVendorLedger([row('A', 'confirmed', 10), row('B', 'potential', 5)])
    expect(ledger.groups.map((g) => g.key)).toEqual(['potential', 'confirmed'])
  })

  it('sorts within a group by cost descending, then name ascending', () => {
    const ledger = buildVendorLedger([
      row('Zephyr', 'confirmed', 100),
      row('Alpha', 'confirmed', 100),
      row('Middle', 'confirmed', 500),
      row('NoCost', 'confirmed'),
    ])
    expect(ledger.groups[0].rows.map((r) => r.name)).toEqual(['Middle', 'Alpha', 'Zephyr', 'NoCost'])
  })

  it('treats missing cost as zero in subtotals and tiles', () => {
    const ledger = buildVendorLedger([row('A', 'confirmed'), row('B', 'potential')])
    expect(ledger.groups.find((g) => g.key === 'confirmed')?.subtotal).toBe(0)
    expect(ledger.tiles).toEqual({ committed: 0, estimated: 0, toConfirmCount: 1, toConfirmValue: 0 })
  })

  it('subtotals each group including declined', () => {
    const ledger = buildVendorLedger([
      row('A', 'confirmed', 1200),
      row('B', 'confirmed', 45.5),
      row('C', 'potential', 500),
      row('D', 'declined', 999),
    ])
    const byKey = Object.fromEntries(ledger.groups.map((g) => [g.key, g.subtotal]))
    expect(byKey).toEqual({ potential: 500, confirmed: 1245.5, declined: 999 })
  })

  it('computes every tile figure and the total row count', () => {
    const ledger = buildVendorLedger([
      row('A', 'confirmed', 1200),
      row('B', 'potential', 500),
      row('C', 'potential', 250.25),
      row('D', 'declined', 999),
    ])
    expect(ledger.tiles).toEqual({
      committed: 1200,
      estimated: 1950.25,
      toConfirmCount: 2,
      toConfirmValue: 750.25,
    })
    expect(ledger.total).toBe(4)
  })

  it('rounds floating-point sums to cents', () => {
    const ledger = buildVendorLedger([row('A', 'potential', 0.1), row('B', 'potential', 0.2)])
    expect(ledger.groups[0].subtotal).toBe(0.3)
    expect(ledger.tiles.toConfirmValue).toBe(0.3)
    expect(ledger.tiles.estimated).toBe(0.3)
  })

  it('keeps the joined client name on each row', () => {
    const ledger = buildVendorLedger([row('A', 'confirmed', 10, 'Northside Brewing')])
    expect(ledger.groups[0].rows[0].clientName).toBe('Northside Brewing')
  })
})
