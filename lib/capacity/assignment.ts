import type { CapacityUnit, Lead } from '@/lib/types'
import { BOOKABLE_STAGES, unitAvailableOn } from '@/lib/capacity/capacity'

/** Per-unit hint for the assignment picker on the lead's `event_date`. */
export interface UnitAnnotation {
  takenBy?: string // title/name of ANOTHER same-date bookable lead consuming this unit
  blocked?: boolean // the unit is retired or blocked-out on the lead's date
}

/**
 * Pure annotation map for the assignment control. For each unit:
 * - `blocked` when the unit isn't available on the lead's date (retired or blocked-out).
 * - `takenBy` = the title of another same-date bookable lead that CONSUMES this unit
 *   (mobile always; venue only when that lead is on-site). Never the lead itself.
 * Absent fields mean "free". Missing `event_date` ⇒ no blocked signal (nothing to check).
 */
export function unitAnnotations(
  lead: Pick<Lead, 'id' | 'event_date'>,
  units: CapacityUnit[],
  sameDateLeads: Lead[],
): Map<string, UnitAnnotation> {
  const date = lead.event_date
  const others = sameDateLeads.filter((l) => l.id !== lead.id && BOOKABLE_STAGES.has(l.stage))
  const map = new Map<string, UnitAnnotation>()

  for (const unit of units) {
    const annotation: UnitAnnotation = {}

    if (date && !unitAvailableOn(unit, date)) annotation.blocked = true

    const taker = others.find((l) => {
      const au = l.assigned_units
      if (!au) return false
      if (unit.kind === 'mobile') return au.mobile === unit.id
      return au.venue === unit.id && l.delivery_mode === 'onsite'
    })
    if (taker) annotation.takenBy = taker.title ?? taker.name

    map.set(unit.id, annotation)
  }

  return map
}
