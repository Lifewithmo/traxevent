import type { VolunteerHoursEntry } from '@/lib/types'

// Totals hours per person_id across all entries.
export function sumHoursByPerson(entries: VolunteerHoursEntry[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const e of entries) {
    totals[e.person_id] = (totals[e.person_id] ?? 0) + e.hours
  }
  return totals
}
