import { describe, it, expect } from 'vitest'
import { wonValueInMonth, bookedAhead, backlogByMonth, backlogWindow, addMonths, addDaysYmd } from '@/lib/pipeline-stats'
import type { Lead } from '@/lib/types'

function lead(over: Partial<Lead>): Lead {
  return { id: 'x', name: 'n', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over } as Lead
}

describe('addMonths / addDaysYmd', () => {
  it('adds months across year boundary', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })
  it('subtracts months across year boundary', () => {
    expect(addMonths('2026-08', -12)).toBe('2025-08')
  })
  it('adds days across month boundary', () => {
    expect(addDaysYmd('2026-08-25', 10)).toBe('2026-09-04')
  })
})

describe('wonValueInMonth', () => {
  it('sums closed_won by closed_at month, ignores lost and other months', () => {
    const leads = [
      lead({ stage: 'closed_won', closed_at: '2026-08-05T10:00:00.000Z', estimated_value: 3000 }),
      lead({ stage: 'closed_won', closed_at: '2026-08-20T10:00:00.000Z', estimated_value: 3300 }),
      lead({ stage: 'closed_lost', closed_at: '2026-08-06T10:00:00.000Z', estimated_value: 800 }),
      lead({ stage: 'closed_won', closed_at: '2026-07-30T10:00:00.000Z', estimated_value: 999 }),
    ]
    expect(wonValueInMonth(leads, '2026-08')).toEqual({ count: 2, value: 6300 })
  })
  it('treats missing estimated_value as 0', () => {
    const leads = [lead({ stage: 'closed_won', closed_at: '2026-08-05T10:00:00.000Z' })]
    expect(wonValueInMonth(leads, '2026-08')).toEqual({ count: 1, value: 0 })
  })
})

describe('bookedAhead', () => {
  it('counts closed_won with event_date inside the window, excluding past and beyond', () => {
    const today = '2026-08-12'
    const leads = [
      lead({ stage: 'closed_won', event_date: '2026-08-12', estimated_value: 100 }),
      lead({ stage: 'closed_won', event_date: '2026-11-09', estimated_value: 200 }),
      lead({ stage: 'closed_won', event_date: '2026-11-11', estimated_value: 400 }),
      lead({ stage: 'closed_won', event_date: '2026-08-11', estimated_value: 800 }),
      lead({ stage: 'proposal', event_date: '2026-09-01', estimated_value: 1600 }),
      lead({ stage: 'closed_won', estimated_value: 3200 }),
    ]
    expect(bookedAhead(leads, today)).toEqual({ count: 2, value: 300 })
  })
})

describe('backlogByMonth', () => {
  it('buckets booked and open value by event_date month from the current month', () => {
    const today = '2026-08-12'
    const leads = [
      lead({ stage: 'closed_won', event_date: '2026-08-30', estimated_value: 1000 }),
      lead({ stage: 'closed_won', event_date: '2026-09-14', estimated_value: 5150 }),
      lead({ stage: 'proposal', event_date: '2026-09-20', estimated_value: 2000 }),
      lead({ stage: 'inquiry', event_date: '2026-11-08', estimated_value: 1800 }),
      lead({ stage: 'closed_lost', event_date: '2026-09-01', estimated_value: 700 }),
      lead({ stage: 'closed_won', event_date: '2026-07-01', estimated_value: 999 }),
    ]
    const rows = backlogByMonth(leads, today, 4)
    expect(rows.map((r) => r.ym)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(rows[0]).toMatchObject({ label: 'Aug', booked: 1000, open: 0 })
    expect(rows[1]).toMatchObject({ label: 'Sep', booked: 5150, open: 2000 })
    expect(rows[2]).toMatchObject({ label: 'Oct', booked: 0, open: 0 })
    expect(rows[3]).toMatchObject({ label: 'Nov', booked: 0, open: 1800 })
  })
  it('backlogByMonth spans 12 months and wraps the year', () => {
    const rows = backlogByMonth([], '2026-08-13', 12)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatchObject({ ym: '2026-08', label: 'Aug' })
    expect(rows[11]).toMatchObject({ ym: '2027-07', label: 'Jul' })
  })
})

describe('backlogWindow', () => {
  it('spans -5..+6 around the current month', () => {
    const rows = backlogWindow([], '2026-08-13')
    expect(rows).toHaveLength(12)
    expect(rows[0].ym).toBe('2026-03')
    expect(rows[5].ym).toBe('2026-08')
    expect(rows[11].ym).toBe('2027-02')
  })

  it('buckets booked and open value the same way as backlogByMonth', () => {
    const today = '2026-08-12'
    const leads = [
      lead({ stage: 'closed_won', event_date: '2026-08-30', estimated_value: 1000 }),
      lead({ stage: 'proposal', event_date: '2026-03-14', estimated_value: 2000 }),
    ]
    const rows = backlogWindow(leads, today)
    expect(rows[0]).toMatchObject({ ym: '2026-03', booked: 0, open: 2000 })
    expect(rows[5]).toMatchObject({ ym: '2026-08', booked: 1000, open: 0 })
  })
})
