import { describe, it, expect } from 'vitest'
import { buildSchedule } from '@/lib/capacity/schedule'
import type { CapacityUnit, Lead, Org } from '@/lib/types'

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

const cellOn = (lane: { cells: { date: string }[] }, date: string) =>
  lane.cells.find((c) => c.date === date)!

describe('buildSchedule', () => {
  it('creates one lane per unit (mobile then venue) plus a trailing unassigned lane', () => {
    const units = [
      unit({ id: 'v1', kind: 'venue', name: 'Room 1' }),
      unit({ id: 'm1', kind: 'mobile', name: 'Kart 1' }),
    ]
    const lanes = buildSchedule([], units, {}, '2026-09-01', 7)
    expect(lanes.map((l) => l.unitId)).toEqual(['m1', 'v1', 'unassigned'])
    expect(lanes.map((l) => l.kind)).toEqual(['mobile', 'venue', 'unassigned'])
    expect(lanes.at(-1)!.unitId).toBe('unassigned')
  })

  it('produces `days` cells starting at today', () => {
    const lanes = buildSchedule([], [unit({ id: 'm1', kind: 'mobile' })], {}, '2026-09-01', 7)
    const cells = lanes[0].cells
    expect(cells).toHaveLength(7)
    expect(cells[0].date).toBe('2026-09-01')
    expect(cells.at(-1)!.date).toBe('2026-09-07')
  })

  it('marks a unit cell booked by a bookable lead assigned to it on that date', () => {
    const units = [unit({ id: 'm1', kind: 'mobile', name: 'Kart 1' })]
    const leads = [
      lead({
        id: 'L1',
        title: 'Crestline Wedding',
        stage: 'closed_won',
        event_date: '2026-09-05',
        assigned_units: { mobile: 'm1' },
      }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 14)
    const cell = cellOn(lanes[0], '2026-09-05')
    expect(cell.leadId).toBe('L1')
    expect(cell.leadTitle).toBe('Crestline Wedding')
    // A day with no booking is empty.
    expect(cellOn(lanes[0], '2026-09-06').leadId).toBeUndefined()
  })

  it('falls back to the lead name when it has no title', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', name: 'Jane Doe', stage: 'inquiry', event_date: '2026-09-03', assigned_units: { mobile: 'm1' } }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    expect(cellOn(lanes[0], '2026-09-03').leadTitle).toBe('Jane Doe')
  })

  it('routes an unassigned in-window dated bookable lead into the unassigned lane', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', title: 'Needs a cart', stage: 'proposal', event_date: '2026-09-04' }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    const unassigned = lanes.at(-1)!
    expect(unassigned.unitId).toBe('unassigned')
    const cell = cellOn(unassigned, '2026-09-04')
    expect(cell.leadId).toBe('L1')
    expect(cell.leadTitle).toBe('Needs a cart')
    // The one unit lane has no booking for it.
    expect(cellOn(lanes[0], '2026-09-04').leadId).toBeUndefined()
  })

  it('does not route a lead into unassigned when its assigned id resolves to a live unit', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', stage: 'inquiry', event_date: '2026-09-04', assigned_units: { mobile: 'm1' } }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    expect(cellOn(lanes.at(-1)!, '2026-09-04').leadId).toBeUndefined()
  })

  it('books a venue lane only for an ON-SITE lead; an offsite venue pin does not (mirrors the forecast)', () => {
    const units = [unit({ id: 'r1', kind: 'venue', name: 'Room A' })]
    const onsite = lead({ id: 'ON', title: 'On-site gig', stage: 'proposal', event_date: '2026-09-04', delivery_mode: 'onsite', assigned_units: { venue: 'r1' } })
    const offsite = lead({ id: 'OFF', title: 'Offsite gig', stage: 'proposal', event_date: '2026-09-05', delivery_mode: 'offsite', assigned_units: { venue: 'r1' } })
    const lanes = buildSchedule([onsite, offsite], units, {}, '2026-09-01', 7)
    const room = lanes.find((l) => l.unitId === 'r1')!
    const unassigned = lanes.at(-1)!
    // On-site: the room is booked.
    expect(cellOn(room, '2026-09-04').leadId).toBe('ON')
    // Offsite: the room is NOT booked (a room isn't consumed offsite)…
    expect(cellOn(room, '2026-09-05').leadId).toBeUndefined()
    // …and the offsite lead falls to the unassigned lane rather than vanishing.
    expect(cellOn(unassigned, '2026-09-05').leadId).toBe('OFF')
  })

  it('treats an assignment to a stale/unknown id as unassigned', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', stage: 'inquiry', event_date: '2026-09-04', assigned_units: { mobile: 'ghost' } }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    expect(cellOn(lanes.at(-1)!, '2026-09-04').leadId).toBe('L1')
  })

  it('flags non-serviceable and unit-blocked cells', () => {
    const cfg: Org['serviceable_days'] = { weekdays: [1, 2, 3, 4, 5] } // Mon–Fri
    const blocked = unit({
      id: 'm1',
      kind: 'mobile',
      blockouts: [{ start: '2026-09-02', end: '2026-09-02' }],
    })
    const lanes = buildSchedule([], [blocked], { serviceable_days: cfg }, '2026-09-01', 7)
    const lane = lanes[0]
    // 2026-09-05 is a Saturday ⇒ non-serviceable.
    expect(cellOn(lane, '2026-09-05').serviceable).toBe(false)
    expect(cellOn(lane, '2026-09-01').serviceable).toBe(true) // Tuesday
    // 2026-09-02 is blocked out for the unit.
    expect(cellOn(lane, '2026-09-02').unitAvailable).toBe(false)
    expect(cellOn(lane, '2026-09-01').unitAvailable).toBe(true)
  })

  it('excludes bookings outside the window', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', stage: 'inquiry', event_date: '2026-10-01', assigned_units: { mobile: 'm1' } }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    expect(lanes[0].cells.every((c) => c.leadId === undefined)).toBe(true)
    expect(lanes.at(-1)!.cells.every((c) => c.leadId === undefined)).toBe(true)
  })

  it('ignores non-bookable leads entirely', () => {
    const units = [unit({ id: 'm1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'L1', stage: 'closed_lost', event_date: '2026-09-03', assigned_units: { mobile: 'm1' } }),
      lead({ id: 'L2', stage: 'closed_lost', event_date: '2026-09-04' }),
    ]
    const lanes = buildSchedule(leads, units, {}, '2026-09-01', 7)
    expect(cellOn(lanes[0], '2026-09-03').leadId).toBeUndefined()
    expect(cellOn(lanes.at(-1)!, '2026-09-04').leadId).toBeUndefined()
  })
})
