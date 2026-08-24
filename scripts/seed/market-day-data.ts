import type { Event, EventSeries } from '@/lib/types'
import { buildEventSlug } from '@/lib/slug'
import { daysFrom, isoFrom } from '@/scripts/seed/dates'
import { cadenceWindowAround, SATURDAY } from '@/scripts/seed/market-dates'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import type { SeedResource } from '@/scripts/seed/types'

/**
 * A market-day season for the existing demo org, as a pure function of `today`
 * (same contract as buildBrewtraxSeed). Written directly with literal ids so
 * re-runs overwrite the same docs — the writer deletes any prior season first.
 *
 * The season walks the inc-2 money story end to end:
 *   - three SAVED + COMPLETED closeouts ($1,243.50 / $980 / $410 — the $410
 *     day burns enough beans that fees + costs exceed sales, so the season
 *     strip renders a LOSS day);
 *   - one SAVED-but-not-completed closeout ($660 — the "ANY saved sales
 *     counts" rule: Mark-complete is optional);
 *   - one past day with NO closeout (the "not closed out" nudge);
 *   - a day dated TODAY (the cadence day itself when today is Saturday,
 *     otherwise an extra day-of doc) so the closeout-lite CTA and the
 *     Today-agenda "Close out" link are walkable;
 *   - two future Saturdays.
 */

export const MARKET_SERIES_ID = 'demo-series-city-market'
export const MARKET_SERIES_NAME = 'City Market Saturdays'
export const MARKET_BOOTH_FEE = 35
export const MARKET_LOCATION = { name: 'City Market Pavilion', address: '650 W Idaho St, Boise, ID' }
export const MARKET_HOURS = { start: '09:00', end: '14:00' }

/** The consumable the loss day burns; resolved to a real resource id by the
 *  writer (find by name, create with this input when absent). */
export interface SeedMarketActuals {
  sales: number
  consumables?: { resourceName: string; qty_used: number }[]
}

export interface SeedMarketDay {
  key: string
  event: Event
  /** Present = written through saveActualsCore (+ completeCloseoutCore when
   *  `completed`) at orgs/{org}/events/{id}/ops/closeout. Absent = no doc. */
  closeout?: { actuals: SeedMarketActuals; completed: boolean }
}

export interface MarketDaySeed {
  series: EventSeries
  /** Ascending by date. */
  days: SeedMarketDay[]
  /** Find-or-create input for the loss day's consumable — taken from the
   *  brewtrax fixture so name and unit_cost stay in lockstep with it. */
  beansResource: SeedResource['input']
}

export function buildMarketDaySeed(today: Date): MarketDaySeed {
  const window = cadenceWindowAround(today, SATURDAY)
  // The whole season was generated when the series was created, before its
  // first day — mirrors createSeriesCore, which writes series + days up front.
  const createdAt = isoFrom(today, -45)

  const beansResource = buildBrewtraxSeed(today).ops.resources
    .find((r) => r.key === 'res-beans')!.input

  const series: EventSeries = {
    id: MARKET_SERIES_ID,
    name: MARKET_SERIES_NAME,
    kind: 'market_day',
    location: MARKET_LOCATION,
    hours: MARKET_HOURS,
    recurrence: { freq: 'weekly', weekday: SATURDAY, from: window.past[0], until: window.future[1] },
    booth_fee: MARKET_BOOTH_FEE,
    active: true,
    created_at: createdAt,
  }

  // Closeout states for the five past Saturdays, oldest first. The $410 day is
  // the loss: 410 − 35 booth fee − 30 lb beans × unit_cost ($14.50 ⇒ $435)
  // lands at −$60 — fees + costs exceed sales, exercising the loss rendering.
  const pastCloseouts: (SeedMarketDay['closeout'] | undefined)[] = [
    { actuals: { sales: 1243.5 }, completed: true },
    { actuals: { sales: 980 }, completed: true },
    {
      actuals: {
        sales: 410,
        consumables: [{ resourceName: beansResource.name, qty_used: 30 }],
      },
      completed: true,
    },
    { actuals: { sales: 660 }, completed: false },
    undefined, // most recent past Saturday: never closed out — the nudge
  ]

  // Every generated day shares the series' name, so slugs collide within a
  // year; mirror resolveUniqueEventSlug deterministically: base, -2, -3, … in
  // ascending date order (the order createSeriesCore creates them in).
  const slugCounts = new Map<string, number>()
  const slugFor = (day: string): { slug: string; year: number } => {
    const year = Number(day.slice(0, 4))
    const base = buildEventSlug(MARKET_SERIES_NAME, year)
    const n = (slugCounts.get(base) ?? 0) + 1
    slugCounts.set(base, n)
    return { slug: n === 1 ? base : `${base}-${n}`, year }
  }

  const dates: { day: string; closeout?: SeedMarketDay['closeout'] }[] = [
    ...window.past.map((day, i) => ({ day, closeout: pastCloseouts[i] })),
    ...(window.extraToday ? [{ day: window.extraToday }] : []),
    { day: window.anchor },
    ...window.future.map((day) => ({ day })),
  ]

  const days: SeedMarketDay[] = dates.map(({ day, closeout }, i) => {
    const { slug, year } = slugFor(day)
    const event: Event = {
      // Mirrors createEventCore's output for a series-generated day: born
      // active, no registration_type, default event type, series fields set.
      id: `demo-mkt-${String(i + 1).padStart(2, '0')}`,
      name: MARKET_SERIES_NAME,
      slug,
      year,
      status: 'active',
      event_type_id: 'event',
      kind: 'market_day',
      location: MARKET_LOCATION,
      hours: MARKET_HOURS,
      booth_fee: MARKET_BOOTH_FEE,
      series_id: MARKET_SERIES_ID,
      event_start: day,
      event_end: day,
      created_at: createdAt,
    }
    return { key: `mkt-${day}`, event, ...(closeout ? { closeout } : {}) }
  })

  return { series, days, beansResource }
}

/** Re-exported so the plan/test can name today's date the same way. */
export function marketTodayYmd(today: Date): string {
  return daysFrom(today, 0)
}
