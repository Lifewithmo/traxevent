import { describe, it, expect } from 'vitest'
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  lineItemSubtotal,
  proposalTotal,
  computeSelectedTotal,
  proposalRange,
  proposalDisplayRange,
  discountAmount,
  depositAmount,
} from '@/lib/proposals'
import type { Proposal, ProposalLineItem } from '@/lib/types'

const item = (quantity: number, unit_price: number): ProposalLineItem => ({ description: 'x', quantity, unit_price })

describe('PROPOSAL_STATUSES', () => {
  it('is the four statuses in order with labels', () => {
    expect(PROPOSAL_STATUSES).toEqual(['draft', 'sent', 'accepted', 'rejected'])
    for (const s of PROPOSAL_STATUSES) expect(PROPOSAL_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('lineItemSubtotal', () => {
  it('multiplies qty by unit price rounded to cents', () => {
    expect(lineItemSubtotal(item(3, 45.99))).toBe(137.97)
    expect(lineItemSubtotal(item(1, 100))).toBe(100)
  })
  it('treats missing/negative as zero', () => {
    expect(lineItemSubtotal(item(-2, 50))).toBe(0)
    expect(lineItemSubtotal(item(2, -5))).toBe(0)
  })
})

describe('proposalTotal', () => {
  it('sums line-item subtotals rounded to cents', () => {
    expect(proposalTotal([item(2, 50), item(1, 45.99)])).toBe(145.99)
    expect(proposalTotal([])).toBe(0)
  })
})

const req = (id: string, quantity: number, unit_price: number): ProposalLineItem => ({
  id,
  description: id,
  quantity,
  unit_price,
  optional: false,
})
const opt = (id: string, quantity: number, unit_price: number): ProposalLineItem => ({
  id,
  description: id,
  quantity,
  unit_price,
  optional: true,
})
const prop = (over: Partial<Proposal>): Proposal => ({
  id: 'p',
  org_id: 'o',
  lead_id: 'l',
  token: 't',
  status: 'sent',
  line_items: [],
  created_at: '',
  ...over,
})

describe('computeSelectedTotal — itemized', () => {
  it('sums required items as the base, ignoring optional ones', () => {
    const p = prop({ line_items: [req('r1', 2, 50), opt('o1', 1, 40)] })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(100)
  })
  it('adds only the selected optional items', () => {
    const p = prop({ line_items: [req('r1', 2, 50), opt('o1', 1, 40)] })
    expect(computeSelectedTotal(p, { optional_item_ids: ['o1'] })).toBe(140)
  })
})

describe('computeSelectedTotal — packaged', () => {
  const p = prop({
    packages: [
      { id: 'good', name: 'Good', includes: [], price: 12500 },
      { id: 'best', name: 'Best', includes: [], price: 22400 },
    ],
    line_items: [opt('o1', 1, 1500)],
  })
  it('uses the selected package price as the base plus add-ons', () => {
    expect(computeSelectedTotal(p, { package_id: 'best', optional_item_ids: ['o1'] })).toBe(23900)
    expect(computeSelectedTotal(p, { package_id: 'good', optional_item_ids: [] })).toBe(12500)
  })
  it('treats an unknown package id as a zero base (defensive)', () => {
    expect(computeSelectedTotal(p, { package_id: 'nope', optional_item_ids: [] })).toBe(0)
  })
})

describe('computeSelectedTotal — discount & tax', () => {
  it('applies a percent discount then tax on the discounted subtotal', () => {
    const p = prop({
      line_items: [req('r1', 1, 100)],
      discount: { type: 'percent', value: 10 },
      tax_rate: 8.25,
    })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(97.43) // 90 * 1.0825
  })
  it('caps a fixed discount at the subtotal', () => {
    const p = prop({ line_items: [req('r1', 1, 100)], discount: { type: 'fixed', value: 500 } })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(0)
  })
})

describe('proposalRange', () => {
  it('packaged: cheapest+none to dearest+all', () => {
    const p = prop({
      packages: [
        { id: 'good', name: 'Good', includes: [], price: 12500 },
        { id: 'best', name: 'Best', includes: [], price: 22400 },
      ],
      line_items: [opt('o1', 1, 1500)],
    })
    expect(proposalRange(p)).toEqual({ min: 12500, max: 23900 })
  })
  it('itemized: required-only to required+all-optional', () => {
    const p = prop({ line_items: [req('r1', 1, 100), opt('o1', 1, 40)] })
    expect(proposalRange(p)).toEqual({ min: 100, max: 140 })
  })
})

describe('proposalDisplayRange', () => {
  it('returns the locked selected_total (min=max) for an accepted proposal', () => {
    const p = prop({
      status: 'accepted',
      packages: [
        { id: 'good', name: 'Good', includes: [], price: 12500 },
        { id: 'best', name: 'Best', includes: [], price: 22400 },
      ],
      line_items: [opt('o1', 1, 1500)],
      selection: { package_id: 'best', optional_item_ids: ['o1'], selected_total: 18000, selected_at: '' },
    })
    expect(proposalDisplayRange(p)).toEqual({ min: 18000, max: 18000 })
  })
  it('matches proposalRange for a packaged proposal that is not yet accepted', () => {
    const p = prop({
      packages: [
        { id: 'good', name: 'Good', includes: [], price: 12500 },
        { id: 'best', name: 'Best', includes: [], price: 22400 },
      ],
      line_items: [opt('o1', 1, 1500)],
    })
    expect(proposalDisplayRange(p)).toEqual(proposalRange(p))
  })
  it('matches proposalRange for an itemized proposal that is not yet accepted', () => {
    const p = prop({ line_items: [req('r1', 1, 100), opt('o1', 1, 40)] })
    expect(proposalDisplayRange(p)).toEqual(proposalRange(p))
  })
})

describe('discountAmount / depositAmount', () => {
  it('computes and caps discount', () => {
    expect(discountAmount(200, { type: 'percent', value: 10 })).toBe(20)
    expect(discountAmount(80, { type: 'fixed', value: 500 })).toBe(80)
    expect(discountAmount(200, undefined)).toBe(0)
  })
  it('computes and caps deposit', () => {
    expect(depositAmount(1000, { type: 'percent', value: 50 })).toBe(500)
    expect(depositAmount(1000, { type: 'fixed', value: 2000 })).toBe(1000)
    expect(depositAmount(1000, undefined)).toBe(0)
  })
})
