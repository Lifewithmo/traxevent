import { describe, it, expect } from 'vitest'
import { unitAnnotations } from '@/lib/capacity/assignment'
import type { CapacityUnit, Lead } from '@/lib/types'

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

describe('unitAnnotations', () => {
  const subject = { id: 'me', event_date: '2026-09-05' }
  const k1 = unit({ id: 'k1', kind: 'mobile', name: 'Kart 1' })
  const k2 = unit({ id: 'k2', kind: 'mobile', name: 'Kart 2' })
  const r1 = unit({ id: 'r1', kind: 'venue', name: 'Room A' })

  it('marks a unit blocked on the lead date', () => {
    const blocked = unit({ id: 'k1', kind: 'mobile', name: 'Kart 1', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] })
    const map = unitAnnotations(subject, [blocked], [])
    expect(map.get('k1')).toEqual({ blocked: true })
  })

  it('a free unit has an empty annotation', () => {
    const map = unitAnnotations(subject, [k1], [])
    expect(map.get('k1')).toEqual({})
  })

  it('names the other same-date lead that consumes a mobile unit', () => {
    const other = lead({ id: 'x', title: 'Benoit baby shower', event_date: '2026-09-05', assigned_units: { mobile: 'k1' } })
    const map = unitAnnotations(subject, [k1, k2], [other])
    expect(map.get('k1')).toEqual({ takenBy: 'Benoit baby shower' })
    expect(map.get('k2')).toEqual({})
  })

  it('never marks the lead itself as taken', () => {
    const self = lead({ id: 'me', title: 'My own event', event_date: '2026-09-05', assigned_units: { mobile: 'k1' } })
    const map = unitAnnotations(subject, [k1], [self])
    expect(map.get('k1')).toEqual({})
  })

  it('does not mark a venue taken when the other lead is offsite', () => {
    const other = lead({ id: 'x', title: 'Offsite gig', event_date: '2026-09-05', delivery_mode: 'offsite', assigned_units: { venue: 'r1' } })
    const map = unitAnnotations(subject, [r1], [other])
    expect(map.get('r1')).toEqual({})
  })

  it('marks a venue taken when the other lead is onsite', () => {
    const other = lead({ id: 'x', title: 'Onsite gala', event_date: '2026-09-05', delivery_mode: 'onsite', assigned_units: { venue: 'r1' } })
    const map = unitAnnotations(subject, [r1], [other])
    expect(map.get('r1')).toEqual({ takenBy: 'Onsite gala' })
  })

  it('is profile-aware: an OFFSITE lead whose profile needs a venue DOES take it', () => {
    const org = { event_type_profiles: [{ name: 'Gala', needsMobile: true, needsVenue: true }] }
    const other = lead({ id: 'x', title: 'Offsite gala', event_type: 'Gala', event_date: '2026-09-05', delivery_mode: 'offsite', assigned_units: { venue: 'r1' } })
    // needsVenue:true is authoritative over the offsite mode ⇒ the venue reads as taken.
    expect(unitAnnotations(subject, [r1], [other], org).get('r1')).toEqual({ takenBy: 'Offsite gala' })
  })

  it('falls back to the lead name when it has no title', () => {
    const other = lead({ id: 'x', name: 'Nameless Co', event_date: '2026-09-05', assigned_units: { mobile: 'k1' } })
    const map = unitAnnotations(subject, [k1], [other])
    expect(map.get('k1')).toEqual({ takenBy: 'Nameless Co' })
  })

  it('ignores a non-bookable same-date lead', () => {
    const lost = lead({ id: 'x', title: 'Lost one', stage: 'closed_lost', event_date: '2026-09-05', assigned_units: { mobile: 'k1' } })
    const map = unitAnnotations(subject, [k1], [lost])
    expect(map.get('k1')).toEqual({})
  })

  it('combines blocked and taken on the same unit', () => {
    const blocked = unit({ id: 'k1', kind: 'mobile', name: 'Kart 1', blockouts: [{ start: '2026-09-05', end: '2026-09-05' }] })
    const other = lead({ id: 'x', title: 'Benoit', event_date: '2026-09-05', assigned_units: { mobile: 'k1' } })
    const map = unitAnnotations(subject, [blocked], [other])
    expect(map.get('k1')).toEqual({ takenBy: 'Benoit', blocked: true })
  })
})
