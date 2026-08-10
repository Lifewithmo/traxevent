import { describe, it, expect } from 'vitest'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import type { Lead } from '@/lib/types'

const lead = (over: Partial<Lead>): Lead =>
  ({ id: 'x', name: 'n', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over }) as Lead

describe('rollupCustomer', () => {
  it('returns zeros for a customer with no opportunities', () => {
    expect(rollupCustomer({}, [])).toEqual({
      openCount: 0, wonCount: 0, lostCount: 0, totalWonValue: 0, openValue: 0, lastContactAt: undefined,
    })
  })

  it('counts by outcome and sums won separately from open', () => {
    const r = rollupCustomer({}, [
      lead({ stage: 'inquiry', estimated_value: 100 }),
      lead({ stage: 'proposal', estimated_value: 250 }),
      lead({ stage: 'closed_won', estimated_value: 1000 }),
      lead({ stage: 'closed_won', estimated_value: 500 }),
      lead({ stage: 'closed_lost', estimated_value: 900 }),
    ])
    expect(r.openCount).toBe(2)
    expect(r.wonCount).toBe(2)
    expect(r.lostCount).toBe(1)
    expect(r.totalWonValue).toBe(1500)
    expect(r.openValue).toBe(350)
  })

  it('treats a missing estimated_value as zero', () => {
    expect(rollupCustomer({}, [lead({ stage: 'closed_won' })]).totalWonValue).toBe(0)
  })

  it('without a last_touch_at, reports the most recent updated_at, falling back to created_at', () => {
    const r = rollupCustomer({}, [
      lead({ created_at: '2026-01-01T00:00:00.000Z' }),
      lead({ created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-03-05T00:00:00.000Z' }),
      lead({ created_at: '2026-02-20T00:00:00.000Z' }),
    ])
    expect(r.lastContactAt).toBe('2026-03-05T00:00:00.000Z')
  })

  it('prefers a lead last_touch_at over updated_at/created_at', () => {
    const r = rollupCustomer({}, [
      lead({ created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z', last_touch_at: '2026-04-01T00:00:00.000Z' }),
    ])
    expect(r.lastContactAt).toBe('2026-04-01T00:00:00.000Z')
  })

  it('counts a customer-level touch with no opportunities at all', () => {
    const r = rollupCustomer({ last_touch_at: '2026-05-01T00:00:00.000Z' }, [])
    expect(r.lastContactAt).toBe('2026-05-01T00:00:00.000Z')
  })
})
