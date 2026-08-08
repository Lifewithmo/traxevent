import { describe, it, expect } from 'vitest'
import {
  initials, addDays, dueStatus, todayYmd, formatRelativeTime,
  bannerContent, attachmentChips, daysSince, lastTouchIso,
} from '@/lib/opportunity-detail'
import type { Proposal, Invoice, Contract } from '@/lib/types'

const asProposal = (p: Partial<Proposal>) => p as Proposal
const asInvoice = (v: Partial<Invoice>) => v as Invoice
const asContract = (c: Partial<Contract>) => c as Contract

describe('initials', () => {
  it('takes first+last initial', () => expect(initials('Ada Lovelace')).toBe('AL'))
  it('single word takes two letters', () => expect(initials('cher')).toBe('CH'))
  it('empty falls back', () => expect(initials('   ')).toBe('?'))
})

describe('addDays', () => {
  it('adds across a month boundary', () => expect(addDays('2026-01-30', 3)).toBe('2026-02-02'))
})

describe('dueStatus', () => {
  it('past is overdue', () => expect(dueStatus('2026-08-04', '2026-08-05')).toBe('overdue'))
  it('same day is today', () => expect(dueStatus('2026-08-05', '2026-08-05')).toBe('today'))
  it('future is upcoming', () => expect(dueStatus('2026-08-06', '2026-08-05')).toBe('upcoming'))
})

describe('todayYmd', () => {
  it('formats a local date', () => expect(todayYmd(new Date(2026, 7, 5, 9, 0, 0))).toBe('2026-08-05'))
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  it('under a minute', () => expect(formatRelativeTime('2026-08-05T11:59:30.000Z', now)).toBe('just now'))
  it('minutes', () => expect(formatRelativeTime('2026-08-05T11:30:00.000Z', now)).toBe('30m ago'))
  it('hours', () => expect(formatRelativeTime('2026-08-05T09:00:00.000Z', now)).toBe('3h ago'))
  it('days', () => expect(formatRelativeTime('2026-08-03T12:00:00.000Z', now)).toBe('2d ago'))
})

describe('bannerContent', () => {
  it('active surfaces the next action', () => {
    const b = bannerContent('active', { nextTitle: 'Call venue', dueYmd: '2026-08-05', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('active')
    expect(b.heading).toBe('Call venue')
    expect(b.detail).toContain('Due today')
  })
  it('overdue active flags it', () => {
    const b = bannerContent('active', { nextTitle: 'Send quote', dueYmd: '2026-08-01', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.detail).toContain('Overdue')
  })
  it('waiting shows reason', () => {
    const b = bannerContent('waiting', { waitingReason: 'Client reviewing', waitingFollowUp: '2026-08-10', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('waiting')
    expect(b.heading).toBe('Waiting')
    expect(b.detail).toContain('Client reviewing')
  })
  it('needs attention prompts a next step', () => {
    const b = bannerContent('needs_attention', { todayYmd: '2026-08-05', stageLabel: 'Inquiry' })
    expect(b.tone).toBe('attention')
    expect(b.heading).toContain('No next action')
  })
  it('closed reflects the outcome', () => {
    const b = bannerContent('closed', { todayYmd: '2026-08-05', stageLabel: 'Closed Won' })
    expect(b.tone).toBe('closed')
    expect(b.detail).toContain('Closed Won')
  })
})

// An unpaid invoice under the lifecycle+balance model: a live invoice with a
// positive balance (line-item total minus applied payments).
const unpaidInvoice = { line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [] }

describe('attachmentChips', () => {
  it('summarizes counts and hints', () => {
    const chips = attachmentChips({
      proposals: [asProposal({ status: 'accepted' }), asProposal({ status: 'draft' })],
      invoices: [asInvoice(unpaidInvoice)],
      contracts: [asContract({ status: 'signed' })],
      vendors: [],
    })
    const byKind = Object.fromEntries(chips.map((c) => [c.kind, c]))
    expect(byKind.proposal.count).toBe(2)
    expect(byKind.proposal.hint).toBe('1 accepted')
    expect(byKind.invoice.count).toBe(1)
    expect(byKind.invoice.hint).toBe('1 unpaid')
    expect(byKind.contract.hint).toBe('signed')
    expect(byKind.vendor.count).toBe(0)
  })

  it('treats a fully-paid live invoice as paid', () => {
    const paid = { line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [{ amount: 100, recorded_at: '' }] }
    const chips = attachmentChips({ proposals: [], invoices: [asInvoice(paid)], contracts: [], vendors: [] })
    const invoice = chips.find((c) => c.kind === 'invoice')!
    expect(invoice.count).toBe(1)
    expect(invoice.hint).toBe('paid')
  })

  it('does not count a voided invoice as unpaid, and shows no hint when all are void', () => {
    const voided: Partial<Invoice> = { lifecycle: 'voided', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [] }
    const chips = attachmentChips({ proposals: [], invoices: [asInvoice(voided)], contracts: [], vendors: [] })
    const invoice = chips.find((c) => c.kind === 'invoice')!
    expect(invoice.count).toBe(1)
    expect(invoice.hint).toBeUndefined()
  })
})

describe('daysSince', () => {
  it('counts whole calendar days from the ISO date part', () => {
    expect(daysSince('2026-07-27T15:00:00.000Z', '2026-08-07')).toBe(11)
    expect(daysSince('2026-08-07T01:00:00.000Z', '2026-08-07')).toBe(0)
  })
})

describe('lastTouchIso', () => {
  it('prefers last_touch_at, then updated_at, then created_at', () => {
    expect(lastTouchIso({ last_touch_at: 'a', updated_at: 'b', created_at: 'c' })).toBe('a')
    expect(lastTouchIso({ updated_at: 'b', created_at: 'c' })).toBe('b')
    expect(lastTouchIso({ created_at: 'c' })).toBe('c')
  })
})
