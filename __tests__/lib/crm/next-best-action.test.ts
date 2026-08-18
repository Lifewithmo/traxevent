import { describe, it, expect } from 'vitest'
import { buildClientRow } from '@/lib/crm/client-list'
import { nextBestAction } from '@/lib/crm/next-best-action'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { Customer, Lead } from '@/lib/types'

const customer: Customer = { id: 'c', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z' }
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const won = (id: string, event_date: string): Lead =>
  lead({ id, stage: 'closed_won', event_date, estimated_value: 1000 })
const rowOf = (leads: Lead[], today: string) => buildClientRow(customer, leads, today)

const emptyAR: CustomerAR = { invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }
const overdueAR = (amount: number): CustomerAR => ({
  invoiced: amount, paid: 0, outstanding: amount, overdueAmount: amount, openCount: 1,
})

const call = (over: Partial<Parameters<typeof nextBestAction>[0]>) =>
  nextBestAction({
    row: rowOf([], '2026-08-15'),
    opportunities: [],
    invoices: [],
    ar: emptyAR,
    todayYmd: '2026-08-15',
    ...over,
  })

describe('nextBestAction — ranking priority', () => {
  it('① overdue AR outranks everything else', () => {
    // This client also has an open lead AND is off-beat — reminder must still win.
    const leads = [
      won('a', '2023-01-10'), won('b', '2024-01-10'), won('c', '2025-01-10'),
      lead({ id: 'open', stage: 'proposal', title: 'Fall gala' }),
    ]
    const nba = call({
      row: rowOf(leads, '2026-08-15'),
      opportunities: leads,
      ar: overdueAR(1200),
      todayYmd: '2026-08-15',
    })
    expect(nba.kind).toBe('reminder')
    expect(nba.label).toBe('Send reminder — $1,200 overdue')
  })

  it('② an open lead outranks an off-beat re-book', () => {
    // Yearly client long silent (off-beat) but also has an open opportunity → follow up first.
    const leads = [
      won('a', '2023-01-10'), won('b', '2024-01-10'), won('c', '2025-01-10'),
      lead({ id: 'open', stage: 'consultation', title: 'Anniversary dinner' }),
    ]
    const nba = call({ row: rowOf(leads, '2026-08-15'), opportunities: leads, todayYmd: '2026-08-15' })
    expect(nba.kind).toBe('followup')
    expect(nba.label).toBe('Follow up — Anniversary dinner')
  })
})

describe('nextBestAction — followup branch', () => {
  it('uses the waiting reason when the open lead is blocked', () => {
    const open = lead({ id: 'open', stage: 'proposal', title: 'Fall gala', waiting: { reason: 'client to sign' } })
    const nba = call({ opportunities: [open], row: rowOf([open], '2026-08-15') })
    expect(nba.kind).toBe('followup')
    expect(nba.label).toBe('Follow up — client to sign')
  })

  it('falls back to the opportunity title when nothing is waiting', () => {
    const open = lead({ id: 'open', stage: 'inquiry', title: 'Summer picnic' })
    const nba = call({ opportunities: [open], row: rowOf([open], '2026-08-15') })
    expect(nba.kind).toBe('followup')
    expect(nba.label).toBe('Follow up — Summer picnic')
  })

  it('ignores closed leads — a closed_won is not an open opportunity', () => {
    const leads = [won('a', '2026-06-05')]
    const nba = call({ opportunities: leads, row: rowOf(leads, '2026-08-15') })
    expect(nba.kind).not.toBe('followup')
  })
})

describe('nextBestAction — rebook branch', () => {
  it('flags an off-beat repeat client with no open lead and no overdue', () => {
    // Yearly client, last booked 2025-01, projected re-book 2026-01, now 2026-08 → ~7mo off-beat.
    const leads = [won('a', '2023-01-10'), won('b', '2024-01-10'), won('c', '2025-01-10')]
    const row = rowOf(leads, '2026-08-15')
    const nba = call({ row, opportunities: leads, todayYmd: '2026-08-15' })
    expect(nba.kind).toBe('rebook')
    expect(nba.label).toMatch(/^Re-book — \d+mo overdue on their pattern$/)
  })
})

describe('nextBestAction — send-proposal branch', () => {
  it('prompts a proposal for a never-booked client', () => {
    const row = rowOf([], '2026-08-15')
    expect(row.group).toBe('never_booked')
    const nba = call({ row, opportunities: [], todayYmd: '2026-08-15' })
    expect(nba.kind).toBe('send-proposal')
    expect(nba.label).toBe('Send proposal')
  })
})

describe('nextBestAction — none / healthy', () => {
  it('returns none when a client is booked and on beat with nothing owed', () => {
    // Future booking on the books, no open leads, no overdue → nothing to nudge.
    const leads = [won('future', '2026-12-05')]
    const row = rowOf(leads, '2026-08-15')
    expect(row.group).toBe('booked_now')
    const nba = call({ row, opportunities: leads, todayYmd: '2026-08-15' })
    expect(nba.kind).toBe('none')
  })
})
