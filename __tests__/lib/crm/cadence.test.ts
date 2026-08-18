import { describe, it, expect } from 'vitest'
import { buildClientRow } from '@/lib/crm/client-list'
import { effectiveCadenceMonths, projectedNextBooking, offBeatMonths } from '@/lib/crm/cadence'
import type { Customer, Lead } from '@/lib/types'

const customer: Customer = { id: 'c', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z' }
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const won = (id: string, event_date: string): Lead =>
  lead({ id, stage: 'closed_won', event_date, estimated_value: 1000 })
const rowOf = (leads: Lead[], today: string) => buildClientRow(customer, leads, today)

describe('effectiveCadenceMonths', () => {
  it('uses the averaged cadence for three-plus won events', () => {
    const row = rowOf([won('a', '2023-01-10'), won('b', '2024-01-10'), won('c', '2025-01-10')], '2025-08-15')
    expect(row.cadenceMonths).toBe(12)
    expect(effectiveCadenceMonths(row)).toBe(12)
  })

  it('falls back to the single gap for exactly two events', () => {
    const row = rowOf([won('a', '2025-01-10'), won('b', '2025-04-10')], '2025-09-05')
    // cadenceMonths stays undefined at two events — the fallback must use the raw gap.
    expect(row.cadenceMonths).toBeUndefined()
    expect(effectiveCadenceMonths(row)).toBe(3)
  })

  it('falls back to twelve months for a single event', () => {
    const row = rowOf([won('a', '2024-06-10')], '2025-08-05')
    expect(effectiveCadenceMonths(row)).toBe(12)
  })

  it('returns null when there is no won history to project from', () => {
    expect(effectiveCadenceMonths(rowOf([], '2025-08-05'))).toBeNull()
  })
})

describe('projectedNextBooking', () => {
  it('adds the cadence to the last event date', () => {
    expect(projectedNextBooking('2025-01-10', 3)).toBe('2025-04-10')
  })

  it('clamps to the last valid day of the target month', () => {
    expect(projectedNextBooking('2025-01-31', 1)).toBe('2025-02-28')
  })

  it('is null without a last event or a cadence', () => {
    expect(projectedNextBooking(null, 3)).toBeNull()
    expect(projectedNextBooking('2025-01-10', null)).toBeNull()
  })
})

describe('offBeatMonths — cadence-relative dormancy', () => {
  it('does NOT flag a yearly client only seven months silent (the fixed bug)', () => {
    // Old code flagged anyone >= 6 months quiet. A yearly client at 7 months is on beat.
    const row = rowOf([won('a', '2023-01-10'), won('b', '2024-01-10'), won('c', '2025-01-10')], '2025-08-15')
    expect(row.monthsSinceLastEvent).toBe(7)
    expect(offBeatMonths(row, '2025-08-15')).toBeNull()
  })

  it('flags a monthly client three months silent even though it is under six', () => {
    const row = rowOf([won('a', '2026-03-05'), won('b', '2026-04-05'), won('c', '2026-05-05')], '2026-08-05')
    expect(row.cadenceMonths).toBe(1)
    expect(offBeatMonths(row, '2026-08-05')).toBeGreaterThan(0)
  })

  it('flags a two-event client past their single-gap beat', () => {
    const row = rowOf([won('a', '2025-01-10'), won('b', '2025-04-10')], '2025-09-05')
    // Gap is 3 months; projected re-book was 2025-07-10, so by Sept they are overdue.
    expect(offBeatMonths(row, '2025-09-05')).toBeGreaterThan(0)
  })

  it('flags a single-event client after a year but not before', () => {
    const leads = [won('a', '2024-06-10')]
    expect(offBeatMonths(rowOf(leads, '2025-08-05'), '2025-08-05')).toBeGreaterThan(0)
    expect(offBeatMonths(rowOf(leads, '2024-11-05'), '2024-11-05')).toBeNull()
  })

  it('returns null for a never-booked client', () => {
    expect(offBeatMonths(rowOf([], '2025-08-05'), '2025-08-05')).toBeNull()
  })
})
