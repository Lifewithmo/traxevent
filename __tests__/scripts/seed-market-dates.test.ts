import { describe, it, expect } from 'vitest'
import { cadenceWindowAround, SATURDAY } from '@/scripts/seed/market-dates'
import { buildMarketDaySeed, MARKET_BOOTH_FEE, MARKET_SERIES_ID } from '@/scripts/seed/market-day-data'
import { buildRosterSeed, ROSTER_ORG_ID } from '@/scripts/seed/roster-data'
import { assertDemoOrgId } from '@/scripts/seed/args'
import { buildEventSlug } from '@/lib/slug'

const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()

// 2026-08-24 is a Monday; 2026-08-22 a Saturday.
const MONDAY = new Date('2026-08-24T12:00:00.000Z')
const SATURDAY_DATE = new Date('2026-08-22T12:00:00.000Z')

describe('cadenceWindowAround — the Saturday math', () => {
  it('puts five ascending Saturdays strictly before a non-cadence today, 7 days apart', () => {
    const w = cadenceWindowAround(MONDAY, SATURDAY)
    expect(w.past).toEqual(['2026-07-25', '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'])
    for (const day of w.past) {
      expect(dow(day)).toBe(SATURDAY)
      expect(day < w.today).toBe(true)
    }
  })

  it('anchors on the NEXT Saturday and flags today as an extra day when today is not a Saturday', () => {
    const w = cadenceWindowAround(MONDAY, SATURDAY)
    expect(w.today).toBe('2026-08-24')
    expect(w.extraToday).toBe('2026-08-24')
    expect(w.anchor).toBe('2026-08-29')
    expect(w.future).toEqual(['2026-09-05', '2026-09-12'])
  })

  it('anchors on today itself, with no extra day, when today IS a Saturday', () => {
    const w = cadenceWindowAround(SATURDAY_DATE, SATURDAY)
    expect(w.anchor).toBe('2026-08-22')
    expect(w.extraToday).toBeNull()
    expect(w.past).toEqual(['2026-07-18', '2026-07-25', '2026-08-01', '2026-08-08', '2026-08-15'])
    expect(w.future).toEqual(['2026-08-29', '2026-09-05'])
  })

  it('handles the day-after-cadence boundary (Sunday) without off-by-one', () => {
    const w = cadenceWindowAround(new Date('2026-08-23T12:00:00.000Z'), SATURDAY)
    expect(w.past[4]).toBe('2026-08-22') // yesterday
    expect(w.anchor).toBe('2026-08-29')  // six days out
    expect(w.extraToday).toBe('2026-08-23')
  })

  it('handles the day-before-cadence boundary (Friday) without off-by-one', () => {
    const w = cadenceWindowAround(new Date('2026-08-21T12:00:00.000Z'), SATURDAY)
    expect(w.past[4]).toBe('2026-08-15') // a week back, not tomorrow
    expect(w.anchor).toBe('2026-08-22')  // tomorrow
  })

  it('is deterministic and rejects invalid weekdays', () => {
    expect(cadenceWindowAround(MONDAY)).toEqual(cadenceWindowAround(MONDAY))
    expect(() => cadenceWindowAround(MONDAY, 7)).toThrow(/Invalid weekday/)
    expect(() => cadenceWindowAround(MONDAY, -1)).toThrow(/Invalid weekday/)
  })
})

describe('buildMarketDaySeed — the season fixture', () => {
  it('seeds 5 past + today + 2 future when today is off-cadence, and 8 total on a Saturday', () => {
    expect(buildMarketDaySeed(MONDAY).days).toHaveLength(9)
    expect(buildMarketDaySeed(SATURDAY_DATE).days).toHaveLength(8)
  })

  it('always includes a day dated today, so the day-of closeout CTA is walkable', () => {
    for (const today of [MONDAY, SATURDAY_DATE]) {
      const seed = buildMarketDaySeed(today)
      const ymd = today.toISOString().slice(0, 10)
      expect(seed.days.some((d) => d.event.event_start === ymd)).toBe(true)
    }
  })

  it('covers every closeout state: 3 completed, 1 saved-only, 1 past day with none', () => {
    const seed = buildMarketDaySeed(MONDAY)
    const past = seed.days.filter((d) => d.event.event_start < '2026-08-24')
    expect(past).toHaveLength(5)
    expect(past.filter((d) => d.closeout?.completed)).toHaveLength(3)
    expect(past.filter((d) => d.closeout && !d.closeout.completed)).toHaveLength(1)
    expect(past.filter((d) => !d.closeout)).toHaveLength(1)
    // The saved-only day carries the $660 that the "any saved sales counts" rule surfaces.
    expect(past.find((d) => d.closeout && !d.closeout.completed)!.closeout!.actuals.sales).toBe(660)
    // The un-closed day is the MOST RECENT past Saturday — the natural nudge target.
    expect(past[4].closeout).toBeUndefined()
  })

  it('makes the $410 day a genuine loss: fees + consumable costs exceed sales', () => {
    const seed = buildMarketDaySeed(MONDAY)
    const lossDay = seed.days.find((d) => d.closeout?.actuals.sales === 410)!
    const burn = lossDay.closeout!.actuals.consumables!
      .reduce((s, c) => s + c.qty_used * (seed.beansResource.unit_cost ?? 0), 0)
    expect(410 - MARKET_BOOTH_FEE - burn).toBeLessThan(0)
    expect(lossDay.closeout!.actuals.consumables![0].resourceName).toBe(seed.beansResource.name)
  })

  it('gives every day the series contract: kind, series_id, booth fee, same-day start/end, active', () => {
    const seed = buildMarketDaySeed(MONDAY)
    for (const d of seed.days) {
      expect(d.event.kind).toBe('market_day')
      expect(d.event.series_id).toBe(MARKET_SERIES_ID)
      expect(d.event.booth_fee).toBe(MARKET_BOOTH_FEE)
      expect(d.event.event_end).toBe(d.event.event_start)
      expect(d.event.status).toBe('active')
      expect(d.event.event_start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('mirrors resolveUniqueEventSlug: unique slugs suffixed off the buildEventSlug base', () => {
    const seed = buildMarketDaySeed(MONDAY)
    const slugs = seed.days.map((d) => d.event.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const d of seed.days) {
      const base = buildEventSlug(d.event.name, d.event.year)
      expect(d.event.slug === base || d.event.slug.startsWith(`${base}-`)).toBe(true)
    }
  })

  it('spans the recurrence over exactly the seeded season', () => {
    const seed = buildMarketDaySeed(MONDAY)
    expect(seed.series.recurrence.from).toBe('2026-07-25')
    expect(seed.series.recurrence.until).toBe('2026-09-12')
    expect(seed.series.recurrence.weekday).toBe(SATURDAY)
  })
})

describe('buildRosterSeed — the check-in fixture', () => {
  const seed = buildRosterSeed(MONDAY)

  it('targets an org id inside the demo- safety allow-list', () => {
    expect(() => assertDemoOrgId(ROSTER_ORG_ID)).not.toThrow()
  })

  it('is a guardian-mode event dated today on the roster-enabled pack, with pickup notify defaulting ON', () => {
    expect(seed.org.industry_pack_id).toBe('general')
    expect(seed.event.registration_type).toBe('child')
    expect(seed.event.event_start).toBe('2026-08-24')
    expect(seed.event.notify_family_on_pickup).toBeUndefined()
  })

  it('has ten families with unique ids and 1–3 children each', () => {
    expect(seed.families).toHaveLength(10)
    const ids = seed.families.map((f) => f.family.id)
    expect(new Set(ids).size).toBe(10)
    for (const f of seed.families) {
      expect(f.members.length).toBeGreaterThanOrEqual(1)
      expect(f.members.length).toBeLessThanOrEqual(3)
      for (const m of f.members) expect(m.family_id).toBe(f.family.id)
    }
  })

  it('shows every check-in desk flag: medical, balance due, waitlist, missing emergency contact', () => {
    const medical = seed.families.filter((f) => f.members.some((m) => m.allergies || m.medical_notes))
    expect(medical.length).toBeGreaterThanOrEqual(3)
    const owing = seed.families.filter((f) => (f.family.amount_due ?? 0) > (f.family.amount_paid ?? 0))
    expect(owing).toHaveLength(4)
    expect(seed.families.filter((f) => f.family.registration_status === 'waitlisted')).toHaveLength(1)
    expect(seed.families.filter((f) => f.family.emergency_contact.name === '')).toHaveLength(1)
  })

  it('signs the required waiver for exactly 6 of 10 families, in the summarizeFormCompletion key shape', () => {
    const signed = seed.families.filter((f) => f.signedForm)
    expect(signed).toHaveLength(6)
    for (const f of signed) {
      expect(f.signedForm!.assignment_id).toBe(seed.formAssignment.id)
      expect(f.signedForm!.org_id).toBe(ROSTER_ORG_ID)
      expect(f.signedForm!.event_id).toBe(seed.event.id)
    }
    expect(seed.formAssignment.required).toBe(true)
    expect(seed.formAssignment.audience).toBe('registrant')
    expect(seed.formAssignment.fields_snapshot).toEqual(seed.formTemplate.fields)
  })

  it('seeds one child currently IN and one finished cycle with a guardian, both today, with inc-2 history ids', () => {
    expect(seed.checkins).toHaveLength(2)
    const inRec = seed.checkins.find((r) => r.status === 'in')!
    const outRec = seed.checkins.find((r) => r.status === 'out')!
    for (const r of [inRec, outRec]) {
      expect(r.date).toBe('2026-08-24')
      expect(r.id).toBe(`${r.date}_${r.member_id}`)
      expect(r.first_checked_in_at).toBe(r.checked_in_at)
      for (const e of r.history!) expect(e.id).toBeTruthy()
      // The seeded member must exist on the roster it will be matched against.
      const family = seed.families.find((f) => f.family.id === r.family_id)!
      expect(family.members.some((m) => m.id === r.member_id)).toBe(true)
    }
    expect(inRec.history).toHaveLength(1)
    expect(outRec.history).toHaveLength(2)
    expect(outRec.guardian_pickup_name).toBeTruthy()
    expect(outRec.history![1]).toMatchObject({ action: 'check_out', guardian: outRec.guardian_pickup_name })
  })

  it('is deterministic', () => {
    expect(buildRosterSeed(MONDAY)).toEqual(buildRosterSeed(MONDAY))
  })
})
