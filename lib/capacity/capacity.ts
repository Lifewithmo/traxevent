import type { CapacityUnit, CapacityUnitKind, Lead } from '@/lib/types'
import { OPEN_STAGES } from '@/lib/leads'

// Bookable = still in play OR the booking itself, matching conflictEventDates in lib/pipeline-view.ts.
const BOOKABLE_STAGES = new Set<Lead['stage']>([...OPEN_STAGES, 'closed_won'])

export interface CapacityShort {
  kind: CapacityUnitKind
  demand: number
  supply: number
}

export interface CapacityDay {
  date: string
  over: boolean // demand exceeds supply for at least one kind
  detail: CapacityShort[]
}

/** A unit is usable on `date` when it's active and the date falls in NONE of its block-outs (inclusive). */
export function unitAvailableOn(unit: CapacityUnit, date: string): boolean {
  if (!unit.active) return false
  return !unit.blockouts.some((b) => b.start <= date && date <= b.end)
}

/** Count of units of `kind` available on `date`. */
export function supply(units: CapacityUnit[], kind: CapacityUnitKind, date: string): number {
  return units.filter((u) => u.kind === kind && unitAvailableOn(u, date)).length
}

/**
 * Pure, in-memory per-date capacity check. For each requested `date`:
 * - bookable(date) = leads with `event_date === date` in a bookable stage.
 * - mobile demand = every bookable lead needs a serving unit.
 * - venue demand  = only the on-site bookable leads need a room.
 * - over = a kind's demand exceeds its available supply.
 */
export function computeCapacity(
  leads: Lead[],
  units: CapacityUnit[],
  dates: string[],
): Map<string, CapacityDay> {
  const result = new Map<string, CapacityDay>()

  for (const date of dates) {
    const bookable = leads.filter((l) => l.event_date === date && BOOKABLE_STAGES.has(l.stage))

    const mobileDemand = bookable.length
    const venueDemand = bookable.filter((l) => l.delivery_mode === 'onsite').length

    const mobileSupply = supply(units, 'mobile', date)
    const venueSupply = supply(units, 'venue', date)

    const detail: CapacityShort[] = [
      { kind: 'mobile', demand: mobileDemand, supply: mobileSupply },
      { kind: 'venue', demand: venueDemand, supply: venueSupply },
    ]

    const over = mobileDemand > mobileSupply || venueDemand > venueSupply

    result.set(date, { date, over, detail })
  }

  return result
}
