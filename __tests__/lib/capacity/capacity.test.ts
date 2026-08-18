import { describe, it, expect } from 'vitest'
import {
  unitAvailableOn,
  supply,
  computeCapacity,
} from '@/lib/capacity/capacity'
import type { CapacityUnit, Lead } from '@/lib/types'

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

describe('unitAvailableOn', () => {
  it('is available for an active unit with no blockouts', () => {
    expect(unitAvailableOn(unit({ kind: 'mobile' }), '2026-09-05')).toBe(true)
  })

  it('is unavailable for a retired (inactive) unit', () => {
    expect(unitAvailableOn(unit({ kind: 'mobile', active: false }), '2026-09-05')).toBe(false)
  })

  it('is unavailable inside a blockout — including the boundary days', () => {
    const u = unit({ kind: 'mobile', blockouts: [{ start: '2026-09-04', end: '2026-09-06' }] })
    expect(unitAvailableOn(u, '2026-09-04')).toBe(false) // start boundary
    expect(unitAvailableOn(u, '2026-09-05')).toBe(false) // inside
    expect(unitAvailableOn(u, '2026-09-06')).toBe(false) // end boundary
  })

  it('is available on days just outside a blockout', () => {
    const u = unit({ kind: 'mobile', blockouts: [{ start: '2026-09-04', end: '2026-09-06' }] })
    expect(unitAvailableOn(u, '2026-09-03')).toBe(true)
    expect(unitAvailableOn(u, '2026-09-07')).toBe(true)
  })

  it('honors a single-day blockout (start === end)', () => {
    const u = unit({ kind: 'venue', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] })
    expect(unitAvailableOn(u, '2026-09-05')).toBe(false)
    expect(unitAvailableOn(u, '2026-09-04')).toBe(true)
  })
})

describe('supply', () => {
  it('counts only matching-kind units that are available on the date', () => {
    const units = [
      unit({ kind: 'mobile' }),
      unit({ kind: 'mobile' }),
      unit({ kind: 'venue' }),
      unit({ kind: 'mobile', active: false }), // retired: excluded
      unit({ kind: 'mobile', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] }), // blocked that day
    ]
    expect(supply(units, 'mobile', '2026-09-05')).toBe(2)
    expect(supply(units, 'venue', '2026-09-05')).toBe(1)
  })

  it('recovers supply on a day outside the blockout', () => {
    const units = [unit({ kind: 'mobile', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] })]
    expect(supply(units, 'mobile', '2026-09-05')).toBe(0)
    expect(supply(units, 'mobile', '2026-09-06')).toBe(1)
  })
})

describe('computeCapacity', () => {
  const mobiles = (n: number) => Array.from({ length: n }, (_, i) => unit({ kind: 'mobile', name: `Kart ${i}` }))
  const venues = (n: number) => Array.from({ length: n }, (_, i) => unit({ kind: 'venue', name: `Room ${i}` }))

  it('is NOT over when bookable demand fits mobile supply', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
      lead({ event_date: '2026-09-05', stage: 'proposal' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }),
    ]
    const map = computeCapacity(leads, mobiles(3), ['2026-09-05'])
    const day = map.get('2026-09-05')!
    expect(day.over).toBe(false)
    const mobile = day.detail.find((d) => d.kind === 'mobile')!
    expect(mobile.demand).toBe(3)
    expect(mobile.supply).toBe(3)
  })

  it('is over when bookable demand exceeds mobile supply', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
      lead({ event_date: '2026-09-05', stage: 'consultation' }),
      lead({ event_date: '2026-09-05', stage: 'proposal' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }),
    ]
    const day = computeCapacity(leads, mobiles(3), ['2026-09-05']).get('2026-09-05')!
    expect(day.over).toBe(true)
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(4)
  })

  it('flags an on-site venue breach even when mobile supply is spare', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'onsite' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'onsite' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won', delivery_mode: 'onsite' }),
    ]
    // 3 mobile (plenty) but only 2 venues → venue demand 3 > supply 2
    const day = computeCapacity(leads, [...mobiles(3), ...venues(2)], ['2026-09-05']).get('2026-09-05')!
    expect(day.over).toBe(true)
    const venue = day.detail.find((d) => d.kind === 'venue')!
    expect(venue.demand).toBe(3)
    expect(venue.supply).toBe(2)
    // mobile is fine on its own
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(3)
  })

  it('counts only on-site leads toward venue demand', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'onsite' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'offsite' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }), // unset ⇒ offsite
    ]
    const day = computeCapacity(leads, [...mobiles(3), ...venues(2)], ['2026-09-05']).get('2026-09-05')!
    expect(day.detail.find((d) => d.kind === 'venue')!.demand).toBe(1)
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(3)
    expect(day.over).toBe(false)
  })

  it('ignores leads with no event_date', () => {
    const leads = [
      lead({ stage: 'inquiry' }), // no date
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
    ]
    const day = computeCapacity(leads, mobiles(3), ['2026-09-05']).get('2026-09-05')!
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(1)
  })

  it('excludes closed_lost and any non-bookable stage from demand', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'closed_lost' }),
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }), // bookable
    ]
    const day = computeCapacity(leads, mobiles(3), ['2026-09-05']).get('2026-09-05')!
    // only inquiry + closed_won count → 2
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(2)
    expect(day.over).toBe(false)
  })

  it('lowers supply — and can tip a day over — when a unit is blocked out that date', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
      lead({ event_date: '2026-09-05', stage: 'proposal' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }),
    ]
    const units = [
      unit({ kind: 'mobile' }),
      unit({ kind: 'mobile' }),
      unit({ kind: 'mobile', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] }),
    ]
    const day = computeCapacity(leads, units, ['2026-09-05']).get('2026-09-05')!
    expect(day.detail.find((d) => d.kind === 'mobile')!.supply).toBe(2) // 3 units, 1 blocked
    expect(day.over).toBe(true) // demand 3 > supply 2
  })

  it('returns a CapacityDay for every requested date, keyed by date', () => {
    const leads = [lead({ event_date: '2026-09-05', stage: 'inquiry' })]
    const map = computeCapacity(leads, mobiles(3), ['2026-09-05', '2026-09-06'])
    expect(map.get('2026-09-05')!.date).toBe('2026-09-05')
    expect(map.get('2026-09-06')!.date).toBe('2026-09-06')
    expect(map.get('2026-09-06')!.over).toBe(false)
    expect(map.get('2026-09-06')!.detail.find((d) => d.kind === 'mobile')!.demand).toBe(0)
  })
})
