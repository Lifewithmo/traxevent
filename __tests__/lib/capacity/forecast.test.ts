import { describe, it, expect } from 'vitest'
import { forecastByMonth } from '@/lib/capacity/forecast'
import type { CapacityUnit, Lead, Org } from '@/lib/types'

// --- Fixtures: only the fields the engine reads ------------------------------

function unit(over: Partial<CapacityUnit> & { kind: CapacityUnit['kind'] }): CapacityUnit {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    name: over.name ?? 'Unit',
    kind: over.kind,
    active: over.active ?? true,
    blockouts: over.blockouts ?? [],
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function lead(over: Partial<Lead>): Lead {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    name: over.name ?? 'Lead',
    stage: over.stage ?? 'inquiry',
    created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

// All 7 weekdays serve unless a cfg narrows it.
const allDays: Org['serviceable_days'] = undefined

describe('forecastByMonth', () => {
  it('returns one month per requested step, current month first', () => {
    const months = forecastByMonth([], [unit({ kind: 'mobile' })], {}, '2026-09-10', 3)
    expect(months.map((m) => m.ym)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(months.map((m) => m.label)).toEqual(['Sep', 'Oct', 'Nov'])
  })

  it('defaults to a 3-month window', () => {
    const months = forecastByMonth([], [unit({ kind: 'mobile' })], {}, '2026-09-10')
    expect(months).toHaveLength(3)
  })

  it('counts the ceiling as available carts × serviceable days (current month partial from today)', () => {
    // Two carts, Sept, serviceable Mon–Fri, from the 10th onward.
    const cfg: Org['serviceable_days'] = { weekdays: [1, 2, 3, 4, 5] }
    const units = [unit({ kind: 'mobile' }), unit({ kind: 'mobile' })]
    const [sep] = forecastByMonth([], units, { serviceable_days: cfg }, '2026-09-10', 1)
    // Serviceable weekdays in Sep 2026 from the 10th: 10,11,14,15,16,17,18,21,22,23,24,25,28,29,30 = 15 days.
    expect(sep.serviceableDays).toBe(15)
    expect(sep.cart.ceiling).toBe(2 * 15)
    expect(sep.cart.booked).toBe(0)
    expect(sep.cart.open).toBe(2 * 15)
  })

  it('lowers the ceiling for a closure day', () => {
    const cfg: Org['serviceable_days'] = { closures: [{ start: '2026-10-05', end: '2026-10-05' }] }
    const units = [unit({ kind: 'mobile' })]
    // Full future month from the 1st.
    const months = forecastByMonth([], units, { serviceable_days: cfg }, '2026-09-30', 2)
    const oct = months.find((m) => m.ym === '2026-10')!
    // October has 31 days; one closed ⇒ 30 serviceable ⇒ ceiling 30 for one cart.
    expect(oct.serviceableDays).toBe(30)
    expect(oct.cart.ceiling).toBe(30)
  })

  it('lowers the ceiling when a unit is blocked out', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] } // Mondays only
    // Mondays in Oct 2026: 5, 12, 19, 26 = 4 days.
    const blocked = unit({ kind: 'mobile', blockouts: [{ start: '2026-10-12', end: '2026-10-12' }] })
    const months = forecastByMonth([], [blocked], { serviceable_days: cfg }, '2026-09-30', 2)
    const oct = months.find((m) => m.ym === '2026-10')!
    expect(oct.serviceableDays).toBe(4)
    // The unit is unavailable on one of the 4 Mondays ⇒ ceiling 3.
    expect(oct.cart.ceiling).toBe(3)
  })

  it('booked = min(events, supply) and never exceeds the ceiling; a full day yields 0 open there', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] } // Mondays only, Oct: 5,12,19,26
    const units = [unit({ kind: 'mobile' })] // supply 1/day
    // Two leads on the same Monday (over-booked) + one lead on another Monday.
    const leads = [
      lead({ stage: 'inquiry', event_date: '2026-10-05' }),
      lead({ stage: 'proposal', event_date: '2026-10-05' }),
      lead({ stage: 'closed_won', event_date: '2026-10-19' }),
    ]
    const months = forecastByMonth(leads, units, { serviceable_days: cfg }, '2026-09-30', 2)
    const oct = months.find((m) => m.ym === '2026-10')!
    expect(oct.cart.ceiling).toBe(4) // 4 Mondays × 1 cart
    // Oct-05 min(2,1)=1, Oct-19 min(1,1)=1 ⇒ booked 2, capped, never 3.
    expect(oct.cart.booked).toBe(2)
    expect(oct.cart.open).toBe(2)
  })

  it('ignores non-bookable stages when counting booked', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] }
    const units = [unit({ kind: 'mobile' })]
    const leads = [lead({ stage: 'closed_lost', event_date: '2026-10-05' })]
    const oct = forecastByMonth(leads, units, { serviceable_days: cfg }, '2026-09-30', 2).find(
      (m) => m.ym === '2026-10',
    )!
    expect(oct.cart.booked).toBe(0)
  })

  it('counts venue booked for on-site leads only', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] }
    const units = [unit({ kind: 'mobile' }), unit({ kind: 'venue' })]
    const leads = [
      lead({ stage: 'inquiry', event_date: '2026-10-05', delivery_mode: 'onsite' }),
      lead({ stage: 'inquiry', event_date: '2026-10-12', delivery_mode: 'offsite' }),
    ]
    const oct = forecastByMonth(leads, units, { serviceable_days: cfg }, '2026-09-30', 2).find(
      (m) => m.ym === '2026-10',
    )!
    // Both consume a cart; only the on-site one consumes a room.
    expect(oct.cart.booked).toBe(2)
    expect(oct.room.booked).toBe(1)
  })

  it('computes headroom as open carts × avg estimated value of bookable leads', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] } // Mondays only, Oct: 4 days
    const units = [unit({ kind: 'mobile' })] // ceiling 4
    const leads = [
      lead({ stage: 'inquiry', event_date: '2026-10-05', estimated_value: 1000 }),
      lead({ stage: 'proposal', event_date: '2026-10-12', estimated_value: 3000 }),
    ]
    const oct = forecastByMonth(leads, units, { serviceable_days: cfg }, '2026-09-30', 2).find(
      (m) => m.ym === '2026-10',
    )!
    // booked: Oct-05 and Oct-12 each min(1,1) ⇒ 2; open = 4 - 2 = 2. avg = 2000.
    expect(oct.cart.open).toBe(2)
    expect(oct.headroomValue).toBe(2 * 2000)
  })

  it('yields 0 headroom when no lead carries an estimated value', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1] }
    const units = [unit({ kind: 'mobile' })]
    const leads = [lead({ stage: 'inquiry', event_date: '2026-10-05' })]
    const oct = forecastByMonth(leads, units, { serviceable_days: cfg }, '2026-09-30', 2).find(
      (m) => m.ym === '2026-10',
    )!
    expect(oct.headroomValue).toBe(0)
  })

  it('treats an absent serviceable_days as all days serviceable', () => {
    const units = [unit({ kind: 'mobile' })]
    const [oct] = forecastByMonth([], units, {}, '2026-10-01', 1)
    expect(oct.serviceableDays).toBe(31) // all of October
    expect(oct.cart.ceiling).toBe(31)
  })
})
