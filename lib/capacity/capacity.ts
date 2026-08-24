import type { CapacityUnit, CapacityUnitKind, Lead, Org } from '@/lib/types'
import { OPEN_STAGES } from '@/lib/leads'
import { leadRequirement } from '@/lib/capacity/requirement'

// Bookable = still in play OR the booking itself, matching conflictEventDates in lib/pipeline-view.ts.
export const BOOKABLE_STAGES = new Set<Lead['stage']>([...OPEN_STAGES, 'closed_won'])

/**
 * Multi-resource capacity is a business-tier feature. The one gate — never
 * scatter `plan === 'business'`. Lives here (firebase-free) so the radar-wiring
 * decision that consumes it stays unit-testable without the data layer; the
 * data layer (`lib/capacity/units.ts`) re-exports it for its own callers.
 */
export function hasMultiResourceCapacity(org: Pick<Org, 'plan'>): boolean {
  return org.plan === 'business'
}

export interface CapacityShort {
  kind: CapacityUnitKind
  demand: number
  supply: number
}

// A single unit pinned to ≥2 bookable leads (that consume its kind) on one date.
// Orthogonal to `over` — a day can be over, clashing, both, or neither.
export interface UnitClash {
  unitId: string
  unitName: string
  kind: CapacityUnitKind
  count: number // number of consuming bookable leads on the date (≥2)
}

export interface CapacityDay {
  date: string
  over: boolean // demand exceeds supply for at least one kind — UNCHANGED, type-level
  detail: CapacityShort[]
  clashes: UnitClash[] // units assigned to ≥2 bookable leads that consume that kind
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
 * - mobile demand = count of bookable leads whose `leadRequirement` needs mobile.
 * - venue demand  = count of bookable leads whose `leadRequirement` needs venue.
 * - over = a kind's demand exceeds its available supply.
 *
 * `org` supplies the optional `event_type_profiles` overlay; absent (the default
 * `{}`) ⇒ `leadRequirement`'s default rule ⇒ mobile for every bookable lead and
 * venue for the on-site ones — byte-for-byte the pre-Inc-4 behavior.
 */
export function computeCapacity(
  leads: Lead[],
  units: CapacityUnit[],
  dates: string[],
  org: Pick<Org, 'event_type_profiles'> = {},
): Map<string, CapacityDay> {
  const result = new Map<string, CapacityDay>()

  for (const date of dates) {
    const bookable = leads.filter((l) => l.event_date === date && BOOKABLE_STAGES.has(l.stage))

    const mobileDemand = bookable.filter((l) => leadRequirement(l, org).mobile).length
    const venueDemand = bookable.filter((l) => leadRequirement(l, org).venue).length

    const mobileSupply = supply(units, 'mobile', date)
    const venueSupply = supply(units, 'venue', date)

    const detail: CapacityShort[] = [
      { kind: 'mobile', demand: mobileDemand, supply: mobileSupply },
      { kind: 'venue', demand: venueDemand, supply: venueSupply },
    ]

    const over = mobileDemand > mobileSupply || venueDemand > venueSupply

    result.set(date, { date, over, detail, clashes: computeClashes(bookable, units, org) })
  }

  return result
}

/** A unit id "consumes" a kind only when it resolves to a live (active, matching-kind) unit.
 *  Stale/retired/wrong-kind ids resolve to undefined and never count toward a clash. */
function liveUnit(units: CapacityUnit[], id: string, kind: CapacityUnitKind): CapacityUnit | undefined {
  return units.find((u) => u.id === id && u.kind === kind && u.active)
}

/**
 * Per-date unit clashes: count each bookable lead's consumed unit ids, skipping
 * ids that don't resolve to a live unit of that kind. A lead consumes its mobile
 * pin only when its `leadRequirement` needs mobile, and its venue pin only when
 * its requirement needs venue (default: mobile always, venue when on-site). Any
 * unit reaching count ≥ 2 is a clash. Blockouts do NOT suppress a clash — a unit
 * booked twice on a blocked day is doubly wrong.
 */
function computeClashes(bookable: Lead[], units: CapacityUnit[], org: Pick<Org, 'event_type_profiles'>): UnitClash[] {
  const counts = new Map<string, { unit: CapacityUnit; count: number }>()
  const bump = (u: CapacityUnit) => {
    const entry = counts.get(u.id)
    if (entry) entry.count += 1
    else counts.set(u.id, { unit: u, count: 1 })
  }
  for (const lead of bookable) {
    const au = lead.assigned_units
    if (!au) continue
    const req = leadRequirement(lead, org)
    if (au.mobile && req.mobile) {
      const u = liveUnit(units, au.mobile, 'mobile')
      if (u) bump(u)
    }
    if (au.venue && req.venue) {
      const u = liveUnit(units, au.venue, 'venue')
      if (u) bump(u)
    }
  }
  const clashes: UnitClash[] = []
  for (const { unit, count } of counts.values()) {
    if (count >= 2) clashes.push({ unitId: unit.id, unitName: unit.name, kind: unit.kind, count })
  }
  return clashes
}

/**
 * The clashing units THIS lead is assigned to. A lead owns a unit's clash only
 * when it actually CONSUMES that unit — its `leadRequirement` needs the kind AND
 * it is pinned to the unit — mirroring `computeClashes` exactly (both route
 * through `leadRequirement`). Without this, a profiled offsite lead (needsVenue:
 * true) would clash in the engine yet never light its row badge, or a
 * needsMobile:false type would falsely own a mobile clash. Empty when the day is
 * undefined or the lead owns no clashing unit. Pure — floats a double-booked row
 * up and renders its badge.
 */
export function rowOwnsClash(
  lead: Lead,
  day: CapacityDay | undefined,
  org: Pick<Org, 'event_type_profiles'> = {},
): UnitClash[] {
  if (!day) return []
  const au = lead.assigned_units
  if (!au) return []
  const req = leadRequirement(lead, org)
  const owned: UnitClash[] = []
  for (const clash of day.clashes) {
    if (clash.kind === 'mobile' && req.mobile && au.mobile === clash.unitId) owned.push(clash)
    else if (clash.kind === 'venue' && req.venue && au.venue === clash.unitId) owned.push(clash)
  }
  return owned
}
