import { describe, it, expect } from 'vitest'
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS, lineItemSubtotal, proposalTotal } from '@/lib/proposals'
import type { ProposalLineItem } from '@/lib/types'

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
