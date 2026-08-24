import { describe, it, expect } from 'vitest'
import {
  unitAvailableOn,
  supply,
  computeCapacity,
  rowOwnsClash,
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

  /*
    WHY THE PAGE MUST GATE ON units.length > 0. With ZERO units, supply is 0 for
    every kind, so a lone bookable lead (demand 1 > supply 0) is `over`. Consulting
    this engine for a unit-less business org would flag EVERY dated opp as a false
    conflict — the reverse of "ship dark until a unit is defined". The backstop
    (radarConflictOpts) exists precisely to keep this engine unconsulted here.
  */
  it('reports over:true for a lone bookable lead when there are NO units (supply 0)', () => {
    const leads = [lead({ event_date: '2026-09-05', stage: 'inquiry' })]
    const day = computeCapacity(leads, [], ['2026-09-05']).get('2026-09-05')!
    expect(day.detail.find((d) => d.kind === 'mobile')!.supply).toBe(0)
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(1)
    expect(day.over).toBe(true) // 1 > 0 — the false positive the gate prevents
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

// --- Unit-clash pass ---------------------------------------------------------

describe('computeCapacity — unit clashes', () => {
  const k1 = () => unit({ id: 'k1', kind: 'mobile', name: 'Kart 1' })
  const k2 = () => unit({ id: 'k2', kind: 'mobile', name: 'Kart 2' })
  const k3 = () => unit({ id: 'k3', kind: 'mobile', name: 'Kart 3' })
  const r1 = () => unit({ id: 'r1', kind: 'venue', name: 'Room A' })

  it('flags a mobile unit assigned to two bookable leads on a date (count 2)', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'k1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'k1' } }),
    ]
    const day = computeCapacity(leads, [k1(), k2(), k3()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toHaveLength(1)
    expect(day.clashes[0]).toMatchObject({ unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 })
  })

  it('does NOT clash when the two leads are on distinct units — even at/over capacity', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'k1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'k2' } }),
    ]
    // 1 unit ⇒ over capacity, but distinct assignments (k1/k2 don't even resolve) ⇒ no clash
    const day = computeCapacity(leads, [k1()], ['2026-09-05']).get('2026-09-05')!
    expect(day.over).toBe(true)
    expect(day.clashes).toEqual([])
  })

  it('ignores a venue assigned to an OFFSITE lead (no venue clash)', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'offsite', assigned_units: { venue: 'r1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'offsite', assigned_units: { venue: 'r1' } }),
    ]
    const day = computeCapacity(leads, [k1(), r1()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toEqual([])
  })

  it('clashes a venue only across on-site leads', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'onsite', assigned_units: { venue: 'r1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'onsite', assigned_units: { venue: 'r1' } }),
    ]
    const day = computeCapacity(leads, [k1(), r1()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toEqual([{ unitId: 'r1', unitName: 'Room A', kind: 'venue', count: 2 }])
  })

  it('never clashes on a stale id that resolves to no live unit of that kind', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'ghost' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'ghost' } }),
    ]
    const day = computeCapacity(leads, [k1(), k2()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toEqual([])
  })

  it('never clashes on a well-formed id pointing at a live unit of the WRONG kind', () => {
    // Both leads pin their MOBILE slot to 'r1' — but r1 is a live VENUE. A
    // wrong-kind resolution is not a real assignment, so the mobile clash count
    // must ignore it. This pins the `u.kind === kind` guard in the live-unit
    // lookup: drop that predicate and this goes red (r1 would resolve, count 2).
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'r1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'r1' } }),
    ]
    const day = computeCapacity(leads, [k1(), r1()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toEqual([])
  })

  it('never clashes on an id pointing at a RETIRED (inactive) unit', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'k1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'k1' } }),
    ]
    const retired = unit({ id: 'k1', kind: 'mobile', name: 'Kart 1', active: false })
    const day = computeCapacity(leads, [retired, k2()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toEqual([])
  })

  it('still clashes on a blocked-out date (blocked and double-booked both show)', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'k1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'k1' } }),
    ]
    const blocked = unit({ id: 'k1', kind: 'mobile', name: 'Kart 1', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] })
    const day = computeCapacity(leads, [blocked, k2()], ['2026-09-05']).get('2026-09-05')!
    expect(day.clashes).toHaveLength(1)
    expect(day.clashes[0].unitId).toBe('k1')
  })

  it('clash and not-over co-occur (2 leads, 3 carts, both Kart 1 ⇒ over false, clash present)', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'k1' } }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'k1' } }),
    ]
    const day = computeCapacity(leads, [k1(), k2(), k3()], ['2026-09-05']).get('2026-09-05')!
    expect(day.over).toBe(false)
    expect(day.clashes).toHaveLength(1)
    expect(day.clashes[0].unitId).toBe('k1')
  })

  it('leaves `over` byte-for-byte unchanged by any assignment (regression pin)', () => {
    const base = [
      lead({ event_date: '2026-09-05', stage: 'inquiry' }),
      lead({ event_date: '2026-09-05', stage: 'proposal' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won' }),
      lead({ event_date: '2026-09-05', stage: 'consultation' }),
    ]
    const assigned = base.map((l, i) =>
      lead({ ...l, assigned_units: { mobile: i % 2 === 0 ? 'k1' : 'k2' } }),
    )
    const units = [k1(), k2(), k3()]
    for (const date of ['2026-09-05']) {
      const withoutA = computeCapacity(base, units, [date]).get(date)!
      const withA = computeCapacity(assigned, units, [date]).get(date)!
      expect(withA.over).toBe(withoutA.over)
      expect(withA.detail).toEqual(withoutA.detail)
    }
  })
})

// --- Per-event-type profiles (Inc 4) -----------------------------------------

describe('computeCapacity — event_type_profiles', () => {
  const mobiles = (n: number) => Array.from({ length: n }, (_, i) => unit({ id: `m${i}`, kind: 'mobile', name: `Kart ${i}` }))
  const venues = (n: number) => Array.from({ length: n }, (_, i) => unit({ id: `v${i}`, kind: 'venue', name: `Room ${i}` }))

  it('BACKSTOP: with no org arg (or no profiles) demand is byte-for-byte the default rule', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'onsite', event_type: 'Wedding' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'offsite', event_type: 'Photo package' }),
      lead({ event_date: '2026-09-05', stage: 'closed_won', event_type: 'Anything' }),
    ]
    const units = [...mobiles(3), ...venues(2)]
    const noArg = computeCapacity(leads, units, ['2026-09-05']).get('2026-09-05')!
    const emptyOrg = computeCapacity(leads, units, ['2026-09-05'], {}).get('2026-09-05')!
    const undefProfiles = computeCapacity(leads, units, ['2026-09-05'], { event_type_profiles: undefined }).get('2026-09-05')!
    // 3 bookable ⇒ mobile demand 3; only the onsite one ⇒ venue demand 1.
    expect(noArg.detail.find((d) => d.kind === 'mobile')!.demand).toBe(3)
    expect(noArg.detail.find((d) => d.kind === 'venue')!.demand).toBe(1)
    expect(emptyOrg.detail).toEqual(noArg.detail)
    expect(undefProfiles.detail).toEqual(noArg.detail)
  })

  it('a {needsMobile:false} profile drops that lead from mobile demand', () => {
    const org = { event_type_profiles: [{ name: 'Photo package', needsMobile: false, needsVenue: false }] }
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', event_type: 'Photo package' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', event_type: 'Wedding' }),
    ]
    const day = computeCapacity(leads, mobiles(3), ['2026-09-05'], org).get('2026-09-05')!
    // Only the Wedding needs a cart.
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(1)
  })

  it('a {needsVenue:true} profile counts a room regardless of delivery_mode (offsite)', () => {
    const org = { event_type_profiles: [{ name: 'Room rental', needsMobile: false, needsVenue: true }] }
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'offsite', event_type: 'Room rental' }),
    ]
    const day = computeCapacity(leads, [...mobiles(1), ...venues(1)], ['2026-09-05'], org).get('2026-09-05')!
    expect(day.detail.find((d) => d.kind === 'venue')!.demand).toBe(1) // counted though offsite
    expect(day.detail.find((d) => d.kind === 'mobile')!.demand).toBe(0) // needsMobile false
  })

  it('BACKSTOP: clashes unchanged with no profiles; a {needsMobile:false} profile suppresses a mobile clash', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', assigned_units: { mobile: 'm0' }, event_type: 'Photo package' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', assigned_units: { mobile: 'm0' }, event_type: 'Photo package' }),
    ]
    // No profiles ⇒ both consume Kart m0 ⇒ clash.
    const noProfiles = computeCapacity(leads, mobiles(2), ['2026-09-05']).get('2026-09-05')!
    expect(noProfiles.clashes).toHaveLength(1)
    // Photo package needs no mobile ⇒ neither consumes m0 ⇒ no clash.
    const org = { event_type_profiles: [{ name: 'Photo package', needsMobile: false, needsVenue: false }] }
    const withProfile = computeCapacity(leads, mobiles(2), ['2026-09-05'], org).get('2026-09-05')!
    expect(withProfile.clashes).toEqual([])
  })

  it('a {needsVenue:true} profile makes an OFFSITE venue pin clash (default would not)', () => {
    const leads = [
      lead({ event_date: '2026-09-05', stage: 'inquiry', delivery_mode: 'offsite', assigned_units: { venue: 'v0' }, event_type: 'Room rental' }),
      lead({ event_date: '2026-09-05', stage: 'proposal', delivery_mode: 'offsite', assigned_units: { venue: 'v0' }, event_type: 'Room rental' }),
    ]
    const org = { event_type_profiles: [{ name: 'Room rental', needsMobile: false, needsVenue: true }] }
    const day = computeCapacity(leads, venues(1), ['2026-09-05'], org).get('2026-09-05')!
    expect(day.clashes).toEqual([{ unitId: 'v0', unitName: 'Room 0', kind: 'venue', count: 2 }])
    // Sanity: with no profiles these offsite venue pins never clash.
    const def = computeCapacity(leads, venues(1), ['2026-09-05']).get('2026-09-05')!
    expect(def.clashes).toEqual([])
  })
})

describe('rowOwnsClash', () => {
  const k1Clash = { unitId: 'k1', unitName: 'Kart 1', kind: 'mobile' as const, count: 2 }
  const r1Clash = { unitId: 'r1', unitName: 'Room A', kind: 'venue' as const, count: 2 }
  const capDay = { date: '2026-09-05', over: false, detail: [], clashes: [k1Clash, r1Clash] }

  it('returns the clash for a lead assigned to a clashing mobile unit', () => {
    const l = lead({ assigned_units: { mobile: 'k1' } })
    expect(rowOwnsClash(l, capDay)).toEqual([k1Clash])
  })

  it('returns [] for an unassigned lead', () => {
    expect(rowOwnsClash(lead({}), capDay)).toEqual([])
  })

  it('returns [] when the day is undefined', () => {
    expect(rowOwnsClash(lead({ assigned_units: { mobile: 'k1' } }), undefined)).toEqual([])
  })

  it('ignores a clashing venue when the lead is offsite', () => {
    const l = lead({ delivery_mode: 'offsite', assigned_units: { venue: 'r1' } })
    expect(rowOwnsClash(l, capDay)).toEqual([])
  })

  it('owns a clashing venue only when onsite', () => {
    const l = lead({ delivery_mode: 'onsite', assigned_units: { venue: 'r1' } })
    expect(rowOwnsClash(l, capDay)).toEqual([r1Clash])
  })

  it('returns both when the lead owns two clashing units', () => {
    const l = lead({ delivery_mode: 'onsite', assigned_units: { mobile: 'k1', venue: 'r1' } })
    expect(rowOwnsClash(l, capDay)).toEqual([k1Clash, r1Clash])
  })

  it('returns [] when the assigned unit is not among the day clashes', () => {
    const l = lead({ assigned_units: { mobile: 'k2' } })
    expect(rowOwnsClash(l, capDay)).toEqual([])
  })
})
