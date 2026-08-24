import type { CapacityUnit, CapacityUnitKind, Lead, Org } from '@/lib/types'
import { BOOKABLE_STAGES, unitAvailableOn } from '@/lib/capacity/capacity'
import { isServiceable } from '@/lib/capacity/serviceable'
import { addDaysYmd } from '@/lib/pipeline-stats'

/** One date in a lane: booked (leadId set) or open; plus serviceable/availability flags. */
export interface ScheduleCell {
  date: string
  leadId?: string
  leadTitle?: string
  serviceable: boolean   // the business is open that day
  unitAvailable: boolean // the unit is active and not blocked out (n/a for the unassigned lane)
}

export interface ScheduleLane {
  unitId: string | 'unassigned'
  unitName: string
  kind: CapacityUnitKind | 'unassigned'
  cells: ScheduleCell[]
}

/** The lead's display label — its opportunity title, falling back to the name. */
function titleOf(lead: Lead): string {
  return lead.title ?? lead.name
}

/**
 * Whether a bookable lead is represented in SOME unit lane — i.e. one of its
 * assigned unit ids resolves to a unit in `units` of the matching kind. Used to
 * decide what falls to the unassigned lane. A stale/unknown id resolves to
 * nothing, so the lead reads as still needing a unit.
 */
/**
 * Does `lead` actually consume `unit`? A mobile unit is consumed by any bookable
 * lead pinned to it; a VENUE only by an ON-SITE one — an offsite lead never uses
 * a room, so a stale `assigned_units.venue` on an offsite lead consumes nothing.
 * This mirrors the forecast's venue.booked and the clash engine (both on-site
 * gated), so a booking can't read as a booked room here yet uncounted there.
 */
function consumes(lead: Lead, unit: CapacityUnit): boolean {
  const au = lead.assigned_units
  if (!au) return false
  if (unit.kind === 'mobile') return au.mobile === unit.id
  return au.venue === unit.id && lead.delivery_mode === 'onsite'
}

function hasLiveAssignment(lead: Lead, units: CapacityUnit[]): boolean {
  return units.some((u) => consumes(lead, u))
}

/**
 * The read-only per-unit schedule: one lane per unit (mobile units first, then
 * venue, preserving input order) plus a trailing `unassigned` lane. The window
 * is `days` dates starting at `today` (default 84 ≈ 12 weeks).
 *
 * A unit lane's cell for date `d` is booked by a bookable lead that `consumes`
 * that unit on `d` (mobile: pinned to it; venue: pinned AND on-site). The
 * unassigned lane surfaces bookable in-window dated leads that resolve to no
 * consumed unit — so a booking still needing a unit is visible rather than
 * silently missing.
 *
 * `serviceable` and `unitAvailable` are reported per cell (non-serviceable and
 * blocked days are flagged, never dropped) so an off-day one-off still shows.
 */
export function buildSchedule(
  leads: Lead[],
  units: CapacityUnit[],
  org: Pick<Org, 'serviceable_days'>,
  today: string,
  days = 84,
): ScheduleLane[] {
  const cfg = org.serviceable_days
  const dates: string[] = []
  for (let i = 0; i < days; i++) dates.push(addDaysYmd(today, i))
  const windowEnd = dates[dates.length - 1] ?? today

  const inWindow = (d?: string): d is string => !!d && d >= today && d <= windowEnd
  const bookable = leads.filter((l) => BOOKABLE_STAGES.has(l.stage) && inWindow(l.event_date))

  const mobiles = units.filter((u) => u.kind === 'mobile')
  const venues = units.filter((u) => u.kind === 'venue')
  const ordered = [...mobiles, ...venues]

  const lanes: ScheduleLane[] = ordered.map((unit) => ({
    unitId: unit.id,
    unitName: unit.name,
    kind: unit.kind,
    cells: dates.map((date) => {
      const booking = bookable.find((l) => l.event_date === date && consumes(l, unit))
      return {
        date,
        leadId: booking?.id,
        leadTitle: booking ? titleOf(booking) : undefined,
        serviceable: isServiceable(date, cfg),
        unitAvailable: unitAvailableOn(unit, date),
      }
    }),
  }))

  // Unassigned lane: bookable in-window dated leads with no live unit assignment.
  const unassignedLeads = bookable.filter((l) => !hasLiveAssignment(l, units))
  const unassignedLane: ScheduleLane = {
    unitId: 'unassigned',
    unitName: 'Unassigned',
    kind: 'unassigned',
    cells: dates.map((date) => {
      const booking = unassignedLeads.find((l) => l.event_date === date)
      return {
        date,
        leadId: booking?.id,
        leadTitle: booking ? titleOf(booking) : undefined,
        serviceable: isServiceable(date, cfg),
        unitAvailable: true, // no unit to gate on
      }
    }),
  }

  return [...lanes, unassignedLane]
}
