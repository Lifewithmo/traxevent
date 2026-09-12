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
  proposalExpiryInstant,
  formatProposalExpiry,
  formatSignedStamp,
} from '@/lib/proposals'
import type { Proposal, ProposalLineItem } from '@/lib/types'

const item = (quantity: number, unit_price: number): ProposalLineItem => ({ description: 'x', quantity, unit_price })

describe('PROPOSAL_STATUSES', () => {
  it('is the five statuses in order with labels', () => {
    expect(PROPOSAL_STATUSES).toEqual(['draft', 'sent', 'accepted', 'rejected', 'voided'])
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

describe('proposalExpiryInstant', () => {
  // The admin editor's expiry field is an <input type="date">, which only
  // ever produces a bare YYYY-MM-DD string — that is the format this field
  // holds in practice, not an edge case. Such a value must mean "valid
  // through the end of that named day," not "expires at UTC midnight."
  it('resolves a date-only value to the end of that calendar day in UTC', () => {
    expect(proposalExpiryInstant('2026-08-06')).toBe(
      new Date('2026-08-06T23:59:59.999Z').getTime(),
    )
  })

  it('uses a value with an explicit time component as-is', () => {
    expect(proposalExpiryInstant('2026-08-06T10:30:00.000Z')).toBe(
      new Date('2026-08-06T10:30:00.000Z').getTime(),
    )
  })

  // An unparseable value must not read as expired — a malformed stored
  // string should never silently brick an otherwise-signable proposal.
  it('does not treat an unparseable value as expired', () => {
    expect(proposalExpiryInstant('not-a-real-date')).toBe(Infinity)
    expect(Date.now() < proposalExpiryInstant('not-a-real-date')).toBe(true)
  })
})

// Node re-reads process.env.TZ on Date/Intl access, so these run the formatter
// under zones on BOTH sides of UTC. The proposal surfaces SSR on one runtime
// and hydrate on another: any zone- or ICU-dependent byte in these strings is
// a React #418 hydration abort on the public signing page (the /checkin crash
// class), so the assertion is exact-string equality in EVERY zone.
const ZONES = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']

function inZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
}

describe('formatProposalExpiry — zone-stable', () => {
  it('renders a date-only deadline as its own calendar day in every zone', () => {
    for (const tz of ZONES) {
      // The mutation this guards against: rendering via the guard's instant
      // (end of day UTC) + toLocaleDateString shows Tokyo "Aug 7, 2026".
      expect(inZone(tz, () => formatProposalExpiry('2026-08-06'))).toBe('Aug 6, 2026')
    }
  })

  it('renders an ISO-instant deadline pinned to UTC and labeled, in every zone', () => {
    for (const tz of ZONES) {
      // 23:30Z is already "tomorrow" east of UTC — a zone-following rendering
      // could not produce the same string in Tokyo and Los Angeles.
      expect(inZone(tz, () => formatProposalExpiry('2026-08-06T23:30:00.000Z'))).toBe(
        'Aug 6, 2026, 11:30 PM UTC',
      )
    }
  })

  it('renders nothing (not "Invalid Date") for unparseable input', () => {
    expect(formatProposalExpiry('not-a-real-date')).toBe('')
    expect(formatProposalExpiry('2026-13-01')).toBe('')
  })
})

describe('formatSignedStamp — one pinned stamp for web, print, and every zone', () => {
  it('renders the identical UTC-labeled stamp in every zone', () => {
    for (const tz of ZONES) {
      // 2:38 AM UTC is the previous evening in Los Angeles — the exact
      // divergence that aborted hydration when this was a bare toLocaleString.
      expect(inZone(tz, () => formatSignedStamp('2026-08-20T02:38:00.000Z'))).toBe(
        'Aug 20, 2026, 2:38 AM UTC',
      )
    }
  })

  it('handles noon and midnight without a 0 o\'clock', () => {
    expect(formatSignedStamp('2026-08-20T00:05:00.000Z')).toBe('Aug 20, 2026, 12:05 AM UTC')
    expect(formatSignedStamp('2026-08-20T12:00:00.000Z')).toBe('Aug 20, 2026, 12:00 PM UTC')
  })

  it('renders nothing for an unparseable stamp', () => {
    expect(formatSignedStamp('garbage')).toBe('')
  })
})
