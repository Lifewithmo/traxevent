import { describe, it, expect } from 'vitest'
import { computeReadiness } from '@/lib/ops/readiness'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [
      { id: 'd1', label: 'Order beans', due: '2026-09-01', done: true },
      { id: 'd2', label: 'Permit check', due: '2026-08-01', done: false },
    ],
    shopping_list: [{ resource_id: 'r1', name: 'Beans', qty: 38, checked: false }],
    packing_list: [{ resource_id: 'r2', name: 'Machine', qty: 1, checked: true }],
    checklists: [{
      id: 'c1', name: 'Prep', phase: 'prep',
      steps: [
        { text: 'a', evidence: 'none', done: true },
        { text: 'b', evidence: 'none', done: false },
      ],
    }],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeReadiness', () => {
  const today = new Date('2026-08-10T12:00:00Z')

  it('counts done/total across deadlines, lists, and checklist steps', () => {
    const r = computeReadiness(plan(), '2026-09-10', today)
    expect(r.total).toBe(6)
    expect(r.done).toBe(3)
    expect(r.pct).toBe(50)
  })

  it('flags undone deadlines with a due date before today as overdue', () => {
    const r = computeReadiness(plan(), '2026-09-10', today)
    expect(r.overdue).toBe(1) // d2 due 2026-08-01, not done
  })

  it('computes days until the event start date', () => {
    const r = computeReadiness(plan(), '2026-08-20', today)
    expect(r.days_until).toBe(10)
  })

  it('is 100% when there is nothing to track', () => {
    const r = computeReadiness(plan({ deadlines: [], shopping_list: [], packing_list: [], checklists: [] }), '2026-08-20', today)
    expect(r.pct).toBe(100)
  })
})

describe('formatMoney', () => {
  it('renders dollars with two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1234.50')
    expect(formatMoney(0.125 * 3)).toBe('$0.38')
  })

  it('renders negative amounts with the sign before the dollar sign', () => {
    expect(formatMoney(-12)).toBe('-$12.00')
  })

  it('renders negative zero as $0.00', () => {
    expect(formatMoney(-0)).toBe('$0.00')
  })
})
