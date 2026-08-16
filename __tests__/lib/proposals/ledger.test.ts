import { describe, it, expect } from 'vitest'
import {
  PROPOSAL_STATUS_TONE,
  PROPOSAL_SIGNAL_TONE,
  PROPOSAL_SIGNAL_LABEL,
  EXPIRING_SOON_DAYS,
  buildProposalLedger,
  type ProposalLedgerInput,
} from '@/lib/proposals/ledger'
import { PROPOSAL_STATUSES, formatProposalMoney } from '@/lib/proposals'
import type { ProposalStatus } from '@/lib/types'

const NOW = new Date('2026-08-16T12:00:00.000Z')

// A minimally-valid proposal: one $100 required line item, so displayRange is
// { min: 100, max: 100 } unless a selection or packages say otherwise.
function p(over: Partial<ProposalLedgerInput> & { id: string; status: ProposalStatus }): ProposalLedgerInput {
  return {
    org_id: 'o1',
    lead_id: `lead-${over.id}`,
    token: `tok-${over.id}`,
    title: `Proposal ${over.id}`,
    clientName: 'Acme',
    line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as ProposalLedgerInput
}

describe('PROPOSAL_STATUS_TONE', () => {
  it('maps every status to a StatusPill tone', () => {
    for (const s of PROPOSAL_STATUSES) expect(PROPOSAL_STATUS_TONE[s]).toBeTruthy()
  })
  it('separates the five statuses into distinct decision tones', () => {
    expect(PROPOSAL_STATUS_TONE.draft).toBe('neutral')
    expect(PROPOSAL_STATUS_TONE.sent).toBe('pending')
    expect(PROPOSAL_STATUS_TONE.accepted).toBe('confirmed')
    expect(PROPOSAL_STATUS_TONE.rejected).toBe('alert')
    expect(PROPOSAL_STATUS_TONE.voided).toBe('alert')
  })
})

describe('buildProposalLedger — grouping', () => {
  it('returns no groups for no proposals', () => {
    const led = buildProposalLedger([], NOW)
    expect(led.groups).toEqual([])
    expect(led.total).toBe(0)
  })

  it('omits empty groups', () => {
    const led = buildProposalLedger([p({ id: 'a', status: 'draft' })], NOW)
    expect(led.groups.map((g) => g.key)).toEqual(['drafts'])
  })

  it('orders groups decision-first', () => {
    const led = buildProposalLedger(
      [
        p({ id: 'closed', status: 'voided' }),
        p({ id: 'acc', status: 'accepted' }),
        p({ id: 'draft', status: 'draft' }),
        p({ id: 'live', status: 'sent', first_opened_at: '2026-08-02T00:00:00.000Z' }),
        p({ id: 'cold', status: 'sent' }),
      ],
      NOW,
    )
    expect(led.groups.map((g) => g.key)).toEqual([
      'needs_attention',
      'out_for_signature',
      'drafts',
      'accepted',
      'closed',
    ])
  })

  it('buckets rejected and voided together as closed', () => {
    const led = buildProposalLedger(
      [p({ id: 'r', status: 'rejected' }), p({ id: 'v', status: 'voided' })],
      NOW,
    )
    expect(led.groups).toHaveLength(1)
    expect(led.groups[0].key).toBe('closed')
    expect(led.groups[0].rows.map((r) => r.id).sort()).toEqual(['r', 'v'])
  })

  it('counts every proposal exactly once across groups', () => {
    const rows = [
      p({ id: 'a', status: 'draft' }),
      p({ id: 'b', status: 'sent' }),
      p({ id: 'c', status: 'accepted' }),
      p({ id: 'd', status: 'rejected' }),
      p({ id: 'e', status: 'voided' }),
    ]
    const led = buildProposalLedger(rows, NOW)
    const seen = led.groups.flatMap((g) => g.rows.map((r) => r.id))
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(led.total).toBe(5)
  })

  it('sorts rows newest-created first within a group', () => {
    const led = buildProposalLedger(
      [
        p({ id: 'old', status: 'draft', created_at: '2026-01-01T00:00:00.000Z' }),
        p({ id: 'new', status: 'draft', created_at: '2026-08-10T00:00:00.000Z' }),
      ],
      NOW,
    )
    expect(led.groups[0].rows.map((r) => r.id)).toEqual(['new', 'old'])
  })
})

describe('buildProposalLedger — needs-attention signals', () => {
  it('flags a sent proposal past its expiry as expired', () => {
    const led = buildProposalLedger(
      [p({ id: 'x', status: 'sent', expires_at: '2026-08-10', first_opened_at: '2026-08-02T00:00:00.000Z' })],
      NOW,
    )
    expect(led.groups[0].key).toBe('needs_attention')
    expect(led.groups[0].rows[0].signal).toBe('expired')
  })

  it('flags a sent proposal expiring within the window', () => {
    const led = buildProposalLedger(
      [p({ id: 'x', status: 'sent', expires_at: '2026-08-20', first_opened_at: '2026-08-02T00:00:00.000Z' })],
      NOW,
    )
    expect(led.groups[0].rows[0].signal).toBe('expiring')
  })

  it('does not flag a sent proposal expiring beyond the window', () => {
    const led = buildProposalLedger(
      [p({ id: 'x', status: 'sent', expires_at: '2026-12-31', first_opened_at: '2026-08-02T00:00:00.000Z' })],
      NOW,
    )
    expect(led.groups[0].key).toBe('out_for_signature')
    expect(led.groups[0].rows[0].signal).toBeUndefined()
  })

  it('treats the whole expiry day as still valid (date-only end-of-day)', () => {
    const led = buildProposalLedger(
      [p({ id: 'x', status: 'sent', expires_at: '2026-08-16', first_opened_at: '2026-08-02T00:00:00.000Z' })],
      NOW,
    )
    expect(led.groups[0].rows[0].signal).toBe('expiring')
  })

  it('flags a sent proposal the client has never opened', () => {
    const led = buildProposalLedger([p({ id: 'x', status: 'sent' })], NOW)
    expect(led.groups[0].rows[0].signal).toBe('unopened')
  })

  it('treats a viewed event as opened even without first_opened_at', () => {
    const led = buildProposalLedger(
      [p({ id: 'x', status: 'sent', events: [{ kind: 'viewed', at: '2026-08-02T00:00:00.000Z' }] })],
      NOW,
    )
    expect(led.groups[0].key).toBe('out_for_signature')
  })

  it('prefers the expiry signal over the unopened signal', () => {
    const led = buildProposalLedger([p({ id: 'x', status: 'sent', expires_at: '2026-08-10' })], NOW)
    expect(led.groups[0].rows[0].signal).toBe('expired')
  })

  it('never flags a non-sent proposal, however stale', () => {
    const led = buildProposalLedger(
      [p({ id: 'd', status: 'draft', expires_at: '2020-01-01' }), p({ id: 'a', status: 'accepted', expires_at: '2020-01-01' })],
      NOW,
    )
    expect(led.groups.map((g) => g.key)).toEqual(['drafts', 'accepted'])
    expect(led.tiles.needsAttention).toBe(0)
  })

  it('exposes the expiring window it used', () => {
    expect(EXPIRING_SOON_DAYS).toBe(7)
  })
})

describe('buildProposalLedger — tiles', () => {
  it('is all zeroes for no proposals', () => {
    const { tiles } = buildProposalLedger([], NOW)
    expect(tiles).toEqual({
      outstandingValue: 0,
      outstandingCount: 0,
      needsAttention: 0,
      acceptedValue: 0,
      acceptedCount: 0,
      depositsDue: 0,
    })
  })

  it('sums the ceiling of every sent proposal as outstanding', () => {
    const { tiles } = buildProposalLedger(
      [
        p({ id: 'a', status: 'sent', line_items: [{ description: 'x', quantity: 2, unit_price: 150 }] }),
        p({ id: 'b', status: 'sent' }),
        p({ id: 'c', status: 'draft' }),
      ],
      NOW,
    )
    expect(tiles.outstandingValue).toBe(400)
    expect(tiles.outstandingCount).toBe(2)
  })

  it('includes optional add-ons in the outstanding ceiling', () => {
    const { tiles } = buildProposalLedger(
      [
        p({
          id: 'a',
          status: 'sent',
          line_items: [
            { id: 'i1', description: 'base', quantity: 1, unit_price: 100 },
            { id: 'i2', description: 'addon', quantity: 1, unit_price: 50, optional: true },
          ],
        }),
      ],
      NOW,
    )
    expect(tiles.outstandingValue).toBe(150)
  })

  it('counts needs-attention rows', () => {
    const { tiles } = buildProposalLedger(
      [p({ id: 'a', status: 'sent' }), p({ id: 'b', status: 'sent', first_opened_at: '2026-08-02T00:00:00.000Z' })],
      NOW,
    )
    expect(tiles.needsAttention).toBe(1)
  })

  it('sums accepted proposals at their locked selection total', () => {
    const { tiles } = buildProposalLedger(
      [
        p({
          id: 'a',
          status: 'accepted',
          selection: { optional_item_ids: [], selected_total: 250, selected_at: '2026-08-05T00:00:00.000Z' },
        }),
        p({ id: 'b', status: 'accepted' }),
      ],
      NOW,
    )
    expect(tiles.acceptedValue).toBe(350)
    expect(tiles.acceptedCount).toBe(2)
  })

  it('excludes rejected and voided from accepted value', () => {
    const { tiles } = buildProposalLedger(
      [
        p({
          id: 'r',
          status: 'rejected',
          selection: { optional_item_ids: [], selected_total: 999, selected_at: '2026-08-05T00:00:00.000Z' },
        }),
        p({
          id: 'v',
          status: 'voided',
          selection: { optional_item_ids: [], selected_total: 999, selected_at: '2026-08-05T00:00:00.000Z' },
        }),
      ],
      NOW,
    )
    expect(tiles.acceptedValue).toBe(0)
    expect(tiles.acceptedCount).toBe(0)
  })

  it('sums unpaid deposits on accepted proposals', () => {
    const { tiles } = buildProposalLedger(
      [
        p({ id: 'a', status: 'accepted', deposit: { type: 'percent', value: 50 } }),
        p({ id: 'b', status: 'accepted', deposit: { type: 'fixed', value: 25 } }),
      ],
      NOW,
    )
    expect(tiles.depositsDue).toBe(75)
  })

  it('excludes already-paid deposits', () => {
    const { tiles } = buildProposalLedger(
      [p({ id: 'a', status: 'accepted', deposit: { type: 'fixed', value: 40 }, payment_status: 'deposit_paid' })],
      NOW,
    )
    expect(tiles.depositsDue).toBe(0)
  })

  it('ignores deposits on proposals that are not accepted', () => {
    const { tiles } = buildProposalLedger(
      [p({ id: 'a', status: 'sent', deposit: { type: 'fixed', value: 40 } })],
      NOW,
    )
    expect(tiles.depositsDue).toBe(0)
  })
})

describe('buildProposalLedger — rows', () => {
  it('carries the fields the ledger renders', () => {
    const led = buildProposalLedger(
      [p({ id: 'a', status: 'draft', title: 'Spring gala', clientName: 'Globex', lead_id: 'L9' })],
      NOW,
    )
    expect(led.groups[0].rows[0]).toMatchObject({
      id: 'a',
      leadId: 'L9',
      title: 'Spring gala',
      clientName: 'Globex',
      status: 'draft',
      min: 100,
      max: 100,
    })
  })

  it('falls back to an untitled label', () => {
    const led = buildProposalLedger([p({ id: 'a', status: 'draft', title: '' })], NOW)
    expect(led.groups[0].rows[0].title).toBe('Untitled proposal')
  })

  it('reports a range when packages spread the price', () => {
    const led = buildProposalLedger(
      [
        p({
          id: 'a',
          status: 'draft',
          line_items: [],
          packages: [
            { id: 'p1', name: 'Basic', includes: [], price: 100 },
            { id: 'p2', name: 'Deluxe', includes: [], price: 300 },
          ],
        }),
      ],
      NOW,
    )
    expect(led.groups[0].rows[0]).toMatchObject({ min: 100, max: 300 })
  })

  it('sums each group to the ceiling of its rows', () => {
    const led = buildProposalLedger(
      [
        p({ id: 'a', status: 'draft' }),
        p({ id: 'b', status: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 250 }] }),
      ],
      NOW,
    )
    expect(led.groups[0].value).toBe(350)
  })

  // Voiding does not clear `selection`, so a voided proposal still reports its
  // locked total. Rolling that up would print dead money beside booked money.
  it('omits the money roll-up for the closed group', () => {
    const led = buildProposalLedger(
      [
        p({
          id: 'v',
          status: 'voided',
          selection: { optional_item_ids: [], selected_total: 50000, selected_at: '2026-08-05T00:00:00.000Z' },
        }),
        p({ id: 'r', status: 'rejected' }),
      ],
      NOW,
    )
    const closed = led.groups.find((g) => g.key === 'closed')!
    expect(closed.rows).toHaveLength(2)
    expect(closed.value).toBeUndefined()
  })

  it('still reports a roll-up for every live group', () => {
    const led = buildProposalLedger(
      [p({ id: 'a', status: 'draft' }), p({ id: 'b', status: 'sent' }), p({ id: 'c', status: 'accepted' })],
      NOW,
    )
    for (const g of led.groups) expect(g.value).toBe(100)
  })
})

describe('PROPOSAL_SIGNAL_TONE / LABEL', () => {
  it('gives every signal a tone and a label', () => {
    for (const s of ['expired', 'expiring', 'unopened'] as const) {
      expect(PROPOSAL_SIGNAL_TONE[s]).toBeTruthy()
      expect(PROPOSAL_SIGNAL_LABEL[s]).toBeTruthy()
    }
  })
  it('reserves the alert tone for an expired proposal', () => {
    expect(PROPOSAL_SIGNAL_TONE.expired).toBe('alert')
    expect(PROPOSAL_SIGNAL_TONE.expiring).toBe('pending')
    expect(PROPOSAL_SIGNAL_TONE.unopened).toBe('pending')
  })
})

describe('formatProposalMoney', () => {
  it('separates thousands', () => {
    expect(formatProposalMoney(12345)).toBe('$12,345')
    expect(formatProposalMoney(0)).toBe('$0')
  })
  // The bug this replaced: toLocaleString() defaults to a 0 minimum and a 3
  // maximum, so $99.90 printed as "$99.9" — a money figure missing a digit.
  it('keeps both cents when there are cents', () => {
    expect(formatProposalMoney(99.9)).toBe('$99.90')
    expect(formatProposalMoney(1234.5)).toBe('$1,234.50')
    expect(formatProposalMoney(2500.75)).toBe('$2,500.75')
  })
  it('omits cents for whole dollars', () => {
    expect(formatProposalMoney(1000)).toBe('$1,000')
  })
})
