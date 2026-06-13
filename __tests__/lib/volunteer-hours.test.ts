import { describe, it, expect } from 'vitest'
import { sumHoursByPerson } from '@/lib/volunteer-hours'
import type { VolunteerHoursEntry } from '@/lib/types'

function entry(o: Partial<VolunteerHoursEntry>): VolunteerHoursEntry {
  return { id: 'h1', person_id: 'p1', person_name: 'Ann', date: '2026-07-10', hours: 4, created_at: 'x', ...o }
}

describe('sumHoursByPerson', () => {
  it('totals hours per person', () => {
    const entries = [
      entry({ person_id: 'p1', person_name: 'Ann', hours: 4 }),
      entry({ person_id: 'p1', person_name: 'Ann', hours: 3 }),
      entry({ person_id: 'p2', person_name: 'Bo', hours: 5 }),
    ]
    const totals = sumHoursByPerson(entries)
    expect(totals).toEqual({ p1: 7, p2: 5 })
  })

  it('returns an empty object for no entries', () => {
    expect(sumHoursByPerson([])).toEqual({})
  })
})
