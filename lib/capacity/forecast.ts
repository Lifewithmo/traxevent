import type { CapacityUnit, Lead, Org } from '@/lib/types'
import { BOOKABLE_STAGES, supply } from '@/lib/capacity/capacity'
import { leadRequirement } from '@/lib/capacity/requirement'
import { serviceableDatesInMonth } from '@/lib/capacity/serviceable'
import { addMonths } from '@/lib/pipeline-stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Booked / open against a per-kind ceiling, summed over a month's serviceable days. */
export interface CapacitySlot {
  ceiling: number // Σ supply over serviceable days
  booked: number  // Σ min(consuming bookable leads, supply) — never exceeds ceiling
  open: number    // ceiling − booked
}

export interface CapacityMonth {
  ym: string             // '2026-09'
  label: string          // 'Sep'
  cart: CapacitySlot     // mobile-kind capacity
  room: CapacitySlot     // venue-kind capacity (booked counts on-site leads only)
  headroomValue: number  // open cart-slots × avg bookable estimated_value (0 with no value signal)
  serviceableDays: number
}

/**
 * The average `estimated_value` across every bookable loaded lead that carries
 * one. Returns 0 when no lead has a value — the caller then shows slots only.
 */
function avgBookableValue(leads: Lead[]): number {
  const values = leads
    .filter((l) => BOOKABLE_STAGES.has(l.stage) && typeof l.estimated_value === 'number')
    .map((l) => l.estimated_value as number)
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Per-month capacity outlook over the operator's real working days.
 *
 * Window = the current month (only days ≥ `today`) plus the next `months − 1`
 * whole months. For each month, over its serviceable dates ≥ today:
 *   cart.ceiling = Σ supply(mobile);  cart.booked = Σ min(bookable events, supply)
 *   room.ceiling = Σ supply(venue);   room.booked = Σ min(on-site bookable, supply)
 * `booked` is capped per-day at supply so it never exceeds the ceiling — an
 * over-booked day still reads as full (0 open), never negative. `headroomValue`
 * multiplies the month's open cart-slots by the average bookable lead value.
 *
 * Pure: no demand is invented; it reports the ceiling and what's already booked.
 */
export function forecastByMonth(
  leads: Lead[],
  units: CapacityUnit[],
  org: Pick<Org, 'serviceable_days' | 'event_type_profiles'>,
  today: string,
  months = 3,
): CapacityMonth[] {
  const cfg = org.serviceable_days
  const avg = avgBookableValue(leads)
  const currentYm = today.slice(0, 7)

  const bookable = leads.filter((l) => BOOKABLE_STAGES.has(l.stage) && l.event_date)

  const out: CapacityMonth[] = []
  for (let i = 0; i < months; i++) {
    const ym = addMonths(currentYm, i)
    // Current month starts at today; later months take the whole month.
    const fromYmd = i === 0 ? today : `${ym}-01`
    const dates = serviceableDatesInMonth(ym, fromYmd, cfg)

    const cart: CapacitySlot = { ceiling: 0, booked: 0, open: 0 }
    const room: CapacitySlot = { ceiling: 0, booked: 0, open: 0 }

    for (const d of dates) {
      const mobileSupply = supply(units, 'mobile', d)
      const venueSupply = supply(units, 'venue', d)

      const onDate = bookable.filter((l) => l.event_date === d)
      const mobileDemand = onDate.filter((l) => leadRequirement(l, org).mobile).length
      const venueDemand = onDate.filter((l) => leadRequirement(l, org).venue).length

      cart.ceiling += mobileSupply
      cart.booked += Math.min(mobileDemand, mobileSupply)
      room.ceiling += venueSupply
      room.booked += Math.min(venueDemand, venueSupply)
    }
    cart.open = cart.ceiling - cart.booked
    room.open = room.ceiling - room.booked

    out.push({
      ym,
      label: MONTHS[Number(ym.slice(5, 7)) - 1],
      cart,
      room,
      headroomValue: cart.open * avg,
      serviceableDays: dates.length,
    })
  }
  return out
}
