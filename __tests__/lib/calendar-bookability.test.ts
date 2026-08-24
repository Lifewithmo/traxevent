import { describe, it, expect } from 'vitest'
import {
  bookability,
  bindingConstraint,
  buildBookabilityCtx,
  nextOpenDates,
  ALTERNATIVE_HORIZON_WEEKS,
  MAX_EVENT_SPAN_DAYS,
  type BookabilityBinding,
  type BookabilityCtx,
} from '@/lib/calendar-bookability'
import { DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import { addDays } from '@/lib/opportunity-detail'
import type { CapacityUnit, Event, Lead, Org } from '@/lib/types'

/**
 * THE BOOKABILITY VERDICT — "are you free September 13?"
 *
 * ── A NOTE ON HOW THESE DATES ARE CHOSEN ────────────────────────────────────
 *
 * Almost every date below is FAR out (90+ days). That is not decoration, it is
 * the thing that makes the suite able to detect anything at all.
 *
 * Lead time is evaluated first and returns `closed` for every date inside the
 * prep window. A capacity test written against a date next week would come back
 * `closed` whatever the capacity code did — including with the capacity code
 * deleted, or bypassed, or inverted. That is the classic masked mutation: a
 * second guard standing in front of the one under test, so the assertion passes
 * for the wrong reason. Dates are therefore pushed clear of the prep window
 * except in the lead-time tests themselves, which pin it deliberately.
 *
 * The mirror-image trap is in the OTHER direction: the zero-units backstop test
 * must also sit outside the prep window, or "business org with no units does not
 * flag everything" would pass on an org whose calendar is closed for a totally
 * different reason.
 */

const TODAY = '2026-08-23'
const FAR = '2026-12-05' // a Saturday, 104 days out — well clear of any prep window
const FAR_2 = '2026-12-12' // the next Saturday

function unit(over: Partial<CapacityUnit> & { kind: CapacityUnit['kind'] }): CapacityUnit {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Unit',
    active: true,
    blockouts: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function lead(over: Partial<Lead>): Lead {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Lead',
    stage: 'inquiry',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function event(over: Partial<Event> & { event_start: string }): Event {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Booked job',
    slug: 'booked-job',
    year: 2026,
    status: 'active',
    event_type_id: 'type-1',
    event_end: over.event_start,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function ctxFor(
  org: Pick<Org, 'plan' | 'prep_lead_days'>,
  leads: Lead[],
  units: CapacityUnit[],
  events: Event[] = [],
  today = TODAY
): BookabilityCtx {
  return buildBookabilityCtx({ orgSlug: 'acme', org, leads, units, events, today })
}

const BUSINESS: Pick<Org, 'plan'> = { plan: 'business' }
// Anything that is not 'business' is the backstop tier; 'standard' is the
// other real plan the schema defines.
const SOLO: Pick<Org, 'plan'> = { plan: 'standard' }

// ─────────────────────────────────────────────────────────────────────────────
describe('the zero-units backstop', () => {
  /**
   * THE most important test in this file.
   *
   * A business-plan org that has not opened the capacity settings yet has ZERO
   * units. `computeCapacity` reports supply 0 for every kind against that list,
   * so every dated day would be over capacity and the entire calendar would read
   * `closed` — for the DEFAULT state of a newly-upgraded org, not an edge case.
   *
   * `radarConflictOpts` exists to prevent precisely that, which is why this
   * module routes through it instead of calling `computeCapacity` itself. Bypass
   * the router and this test is what fails.
   */
  it('does NOT flag a business org that has defined no units yet', () => {
    const leads = [
      lead({ id: 'a', event_date: FAR, stage: 'inquiry' }),
      lead({ id: 'b', event_date: FAR_2, stage: 'closed_won' }),
      lead({ id: 'c', event_date: '2026-12-19', stage: 'proposal' }),
    ]
    const ctx = ctxFor(BUSINESS, leads, [])

    // Never enters capacity mode: with no units there is no capacity to model.
    expect(ctx.radar.mode).toBe('degraded')
    for (const d of [FAR, FAR_2, '2026-12-19']) {
      expect(bookability(d, ctx).verdict).toBe('open')
    }
  })

  it('does not flag an undated business org with no units on an arbitrary day', () => {
    const ctx = ctxFor(BUSINESS, [], [])
    expect(bookability(FAR, ctx)).toEqual({
      verdict: 'open',
      binding: null,
      basis: { kind: 'clear', booked: 0, reason: 'Nothing on file stands in the way of Dec 5.' },
      alternatives: [],
    })
  })

  it('enters capacity mode only once a unit exists', () => {
    expect(ctxFor(BUSINESS, [], [unit({ kind: 'mobile' })]).radar.mode).toBe('capacity')
    expect(ctxFor(SOLO, [], [unit({ kind: 'mobile' })]).radar.mode).toBe('degraded')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the degraded (conflictDates) branch', () => {
  it('says tight — never a confident closed — when two jobs share a date', () => {
    const leads = [
      lead({ id: 'a', event_date: FAR, stage: 'inquiry' }),
      lead({ id: 'b', event_date: FAR, stage: 'closed_won' }),
    ]
    const ctx = ctxFor(SOLO, leads, [])
    const out = bookability(FAR, ctx)

    expect(out.verdict).toBe('tight')
    expect(out.verdict).not.toBe('closed')
    expect(out.binding?.rule).toBe('capacity.unknown')
  })

  it('admits in the sentence that it cannot tell, and links to where to say', () => {
    const leads = [
      lead({ id: 'a', event_date: FAR }),
      lead({ id: 'b', event_date: FAR }),
      lead({ id: 'c', event_date: FAR }),
    ]
    const binding = bindingConstraint(FAR, ctxFor(SOLO, leads, [])).binding!

    // Three jobs on one date is a LOT for a solo cart, and it is still not
    // enough to say closed: nothing here knows how many carts they run.
    expect(binding.reason).toMatch(/can't tell/i)
    expect(binding.reason).toMatch(/no cart or room capacity is set up/i)
    expect(binding.inputs.capacityConfigured).toBe(false)
    expect(binding.fixHref).toBe('/acme/capacity')
  })

  it('leaves every other date open — the backstop stays quiet', () => {
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const ctx = ctxFor(SOLO, leads, [])
    expect(bookability(FAR_2, ctx).verdict).toBe('open')
  })

  it('a single job on a date is not a signal at all', () => {
    const ctx = ctxFor(SOLO, [lead({ id: 'a', event_date: FAR })], [])
    expect(bookability(FAR, ctx).verdict).toBe('open')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('constraint 1 — supply', () => {
  const carts = [
    unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' }),
    unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' }),
  ]

  it('over capacity is CLOSED, and names the kind, the demand and the supply', () => {
    const leads = [
      lead({ id: 'a', event_date: FAR }),
      lead({ id: 'b', event_date: FAR }),
      lead({ id: 'c', event_date: FAR }),
    ]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, carts))

    expect(out.verdict).toBe('closed')
    expect(out.binding).toMatchObject({
      rule: 'capacity.over',
      inputs: { date: FAR, kind: 'mobile', demand: 3, supply: 2 },
      fixHref: '/acme/capacity',
    })
    expect(out.binding!.reason).toContain('3 jobs need a cart')
    expect(out.binding!.reason).toContain('only 2 carts')
  })

  it('at capacity but not over is TIGHT, not closed — booking is still a decision', () => {
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, carts))

    expect(out.verdict).toBe('tight')
    expect(out.binding).toMatchObject({
      rule: 'capacity.at-capacity',
      inputs: { kind: 'mobile', demand: 2, supply: 2 },
    })
    expect(out.binding!.reason).toContain('all 2 carts')
  })

  it('room shortage on an on-site day binds too', () => {
    const units = [...carts, unit({ id: 'r1', name: 'Room #1', kind: 'venue' })]
    const leads = [
      lead({ id: 'a', event_date: FAR, delivery_mode: 'onsite' }),
      lead({ id: 'b', event_date: FAR, delivery_mode: 'onsite' }),
    ]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, units))
    // Carts are at 2 of 2 and rooms are 2 needed vs 1 — over beats at-capacity.
    expect(out.verdict).toBe('closed')
    expect(out.binding).toMatchObject({ rule: 'capacity.over', inputs: { kind: 'venue', demand: 2, supply: 1 } })
    expect(out.binding!.reason).toContain('only 1 room is available')
  })

  it('a day with headroom is open', () => {
    const ctx = ctxFor(BUSINESS, [lead({ id: 'a', event_date: FAR })], carts)
    expect(bookability(FAR, ctx)).toMatchObject({ verdict: 'open', binding: null })
  })

  it('every cart blocked out is CLOSED and names the block-out', () => {
    const blocked = [
      unit({ id: 'k1', name: 'Kart 1', kind: 'mobile', blockouts: [{ start: FAR, end: FAR, note: 'maintenance' }] }),
    ]
    const out = bookability(FAR, ctxFor(BUSINESS, [], blocked))

    expect(out.verdict).toBe('closed')
    expect(out.binding).toMatchObject({
      rule: 'capacity.blocked-out',
      inputs: { kind: 'mobile', available: 0, activeUnits: 1 },
    })
    expect(out.binding!.reason).toContain('Kart 1')
    expect(out.binding!.reason).toContain('maintenance')
  })

  it('block-out outranks over-capacity when both fire — it is the more useful sentence', () => {
    const blocked = [
      unit({ id: 'k1', name: 'Kart 1', kind: 'mobile', blockouts: [{ start: FAR, end: FAR }] }),
    ]
    // 1 job, 0 available carts: computeCapacity also calls this `over`.
    const out = bindingConstraint(FAR, ctxFor(BUSINESS, [lead({ id: 'a', event_date: FAR })], blocked))
    expect(out.binding?.rule).toBe('capacity.blocked-out')
  })

  /**
   * The `activeCarts > 0` guard, and the same class of false flag the zero-units
   * backstop prevents one level up. An org that has only defined ROOMS has zero
   * carts on EVERY date; without the guard, "every cart is blocked out" would
   * fire on every day of its calendar forever.
   *
   * The date deliberately holds no leads, so `capacity.over` cannot mask the
   * result: this isolates the guard and nothing else.
   */
  it('an org that runs only rooms is not told its (nonexistent) carts are blocked out', () => {
    const roomsOnly = [unit({ id: 'r1', name: 'Room #1', kind: 'venue' })]
    expect(bookability(FAR, ctxFor(BUSINESS, [], roomsOnly)).verdict).toBe('open')
  })

  it('a retired cart is not counted as supply — but is not reported as a block-out either', () => {
    const retired = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile', active: false })]
    // No ACTIVE carts at all, so the org effectively runs none: stay quiet.
    expect(bookability(FAR, ctxFor(BUSINESS, [], retired)).verdict).toBe('open')
  })

  it('a unit pinned to two jobs on one day is TIGHT even with headroom', () => {
    const three = [...carts, unit({ id: 'k3', name: 'Kart 3', kind: 'mobile' })]
    const leads = [
      lead({ id: 'a', event_date: FAR, assigned_units: { mobile: 'k1' } }),
      lead({ id: 'b', event_date: FAR, assigned_units: { mobile: 'k1' } }),
    ]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, three))

    expect(out.verdict).toBe('tight')
    expect(out.binding).toMatchObject({ rule: 'capacity.unit-clash', inputs: { unit: 'Kart 1', jobs: 2 } })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('constraint 2 — lead time', () => {
  const noUnits: CapacityUnit[] = []

  it('reuses the org prep lead, defaulting to DEFAULT_PREP_LEAD_DAYS', () => {
    expect(ctxFor(SOLO, [], noUnits).prepLeadDays).toBe(DEFAULT_PREP_LEAD_DAYS)
    expect(ctxFor({ ...SOLO, prep_lead_days: 21 }, [], noUnits).prepLeadDays).toBe(21)
  })

  /**
   * THE BOUNDARY. With a 14-day prep lead, a date exactly 14 days out has its
   * book-by date landing ON today — still sellable, today, right now. Only the
   * day after that is too late. `<` not `<=`; flipping it steals a day from the
   * operator on every single call.
   */
  it('is open exactly at today + prep_lead_days', () => {
    const ctx = ctxFor(SOLO, [], noUnits)
    const boundary = addDays(TODAY, DEFAULT_PREP_LEAD_DAYS)
    expect(bookability(boundary, ctx).verdict).toBe('open')
  })

  it('is closed one day inside the boundary', () => {
    const ctx = ctxFor(SOLO, [], noUnits)
    const inside = addDays(TODAY, DEFAULT_PREP_LEAD_DAYS - 1)
    const out = bookability(inside, ctx)

    expect(out.verdict).toBe('closed')
    expect(out.binding).toMatchObject({
      rule: 'leadtime.book-by-passed',
      inputs: { date: inside, bookBy: addDays(inside, -DEFAULT_PREP_LEAD_DAYS), today: TODAY, prepLeadDays: 14 },
      fixHref: '/acme/settings',
    })
    // The sentence names the deadline that already passed, in plain language.
    expect(out.binding!.reason).toMatch(/can't be prepped in time/)
    // Sep 5 minus a 14-day lead is Aug 22 — yesterday. Missed by one day.
    expect(out.binding!.reason).toMatch(/book-by date was Aug 22/)
  })

  it('honours a custom prep lead at its own boundary', () => {
    const ctx = ctxFor({ ...SOLO, prep_lead_days: 30 }, [], noUnits)
    expect(bookability(addDays(TODAY, 30), ctx).verdict).toBe('open')
    expect(bookability(addDays(TODAY, 29), ctx).verdict).toBe('closed')
  })

  it('today itself is closed under any positive prep lead', () => {
    expect(bookability(TODAY, ctxFor(SOLO, [], noUnits)).verdict).toBe('closed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('worst-first precedence', () => {
  /**
   * Two constraints firing at once. Both are `closed`, so severity does not
   * separate them; the documented tie-break does. Lead time binds first because
   * it is the one nothing fixes — you cannot buy back calendar days, but you can
   * unblock a cart, sub-rent one, or move a job.
   *
   * Swap the two blocks in `bindingConstraint` and this is the test that fails.
   */
  it('lead time binds ahead of over-capacity when both fire', () => {
    const soon = addDays(TODAY, 3)
    const carts = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]
    const leads = [lead({ id: 'a', event_date: soon }), lead({ id: 'b', event_date: soon })]
    const out = bindingConstraint(soon, ctxFor(BUSINESS, leads, carts))

    expect(out.verdict).toBe('closed')
    expect(out.binding?.rule).toBe('leadtime.book-by-passed')
  })

  it('over-capacity (closed) binds ahead of a unit clash (tight)', () => {
    const carts = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]
    const leads = [
      lead({ id: 'a', event_date: FAR, assigned_units: { mobile: 'k1' } }),
      lead({ id: 'b', event_date: FAR, assigned_units: { mobile: 'k1' } }),
    ]
    const out = bindingConstraint(FAR, ctxFor(BUSINESS, leads, carts))
    expect(out.verdict).toBe('closed')
    expect(out.binding?.rule).toBe('capacity.over')
  })

  it('at-capacity (tight) binds ahead of a unit clash (tight)', () => {
    const carts = [
      unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' }),
      unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' }),
    ]
    const leads = [
      lead({ id: 'a', event_date: FAR, assigned_units: { mobile: 'k1' } }),
      lead({ id: 'b', event_date: FAR, assigned_units: { mobile: 'k1' } }),
    ]
    const out = bindingConstraint(FAR, ctxFor(BUSINESS, leads, carts))
    expect(out.binding?.rule).toBe('capacity.at-capacity')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('provenance', () => {
  /** Every rule the module can emit, each in a state where it actually fires. */
  const cases: Array<{ rule: string; date: string; ctx: BookabilityCtx }> = [
    {
      rule: 'leadtime.book-by-passed',
      date: addDays(TODAY, 2),
      ctx: ctxFor(SOLO, [], []),
    },
    {
      rule: 'capacity.blocked-out',
      date: FAR,
      ctx: ctxFor(BUSINESS, [], [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile', blockouts: [{ start: FAR, end: FAR }] })]),
    },
    {
      rule: 'capacity.over',
      date: FAR,
      ctx: ctxFor(
        BUSINESS,
        [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })],
        [unit({ id: 'k1', kind: 'mobile' })]
      ),
    },
    {
      rule: 'capacity.at-capacity',
      date: FAR,
      ctx: ctxFor(BUSINESS, [lead({ id: 'a', event_date: FAR })], [unit({ id: 'k1', kind: 'mobile' })]),
    },
    {
      rule: 'capacity.unit-clash',
      date: FAR,
      ctx: ctxFor(
        BUSINESS,
        [
          lead({ id: 'a', event_date: FAR, assigned_units: { mobile: 'k1' } }),
          lead({ id: 'b', event_date: FAR, assigned_units: { mobile: 'k1' } }),
        ],
        [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' }), unit({ id: 'k2', kind: 'mobile' }), unit({ id: 'k3', kind: 'mobile' })]
      ),
    },
    {
      rule: 'capacity.unknown',
      date: FAR,
      ctx: ctxFor(SOLO, [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })], []),
    },
  ]

  it('covers every rule the module can emit', () => {
    expect(new Set(cases.map((c) => c.rule)).size).toBe(6)
  })

  it.each(cases)('$rule carries rule, inputs, reason and a fixHref', ({ rule, date, ctx }) => {
    const out = bookability(date, ctx)
    expect(out.verdict).not.toBe('open')
    const b = out.binding
    expect(b).not.toBeNull()
    expect(b!.rule).toBe(rule)

    // A verdict nobody can check is a black box, which is the one thing this
    // feature is not allowed to be.
    expect(Object.keys(b!.inputs).length).toBeGreaterThan(0)
    expect(b!.reason.length).toBeGreaterThan(20)
    expect(b!.reason.trim().endsWith('.')).toBe(true)

    // …and a wrong verdict has to be FIXABLE, at the field that produced it.
    expect(typeof b!.fixHref).toBe('string')
    expect(b!.fixHref).toMatch(/^\/acme\/(capacity|settings)$/)
  })

  /**
   * A TYPE-LEVEL guard, checked by `tsc --noEmit`, not by the runner.
   *
   * Found by mutation testing: widening `fixHref` to optional is invisible to
   * every runtime assertion above — the existing rules still set it, so nothing
   * fails — while quietly permitting the NEXT rule to ship without one. Making
   * it required is the only thing that stops that, so the requirement itself is
   * asserted here. Flip the field to `fixHref?: string` and this line stops
   * compiling.
   */
  type FixHrefIsRequired = BookabilityBinding extends { fixHref: string } ? true : never
  const _fixHrefIsRequired: FixHrefIsRequired = true

  it('requires a fixHref at the type level, so a new rule cannot omit one', () => {
    expect(_fixHrefIsRequired).toBe(true)
  })

  /** `binding` is the constraint that STOPPED the day, so an open day has none.
   *  Its provenance rides the complementary `basis` channel instead — see the
   *  "basis of an OPEN verdict" block below. The two are never both non-null. */
  it('an open verdict carries no binding at all — its provenance is the basis', () => {
    const out = bookability(FAR, ctxFor(SOLO, [], []))
    expect(out.binding).toBeNull()
    expect(out).toEqual({
      verdict: 'open',
      binding: null,
      basis: { kind: 'clear', booked: 0, reason: 'Nothing on file stands in the way of Dec 5.' },
      alternatives: [],
    })
  })

  it('the fixHref for a lead-time verdict points at the org setting, not at capacity', () => {
    const b = bindingConstraint(addDays(TODAY, 2), ctxFor(SOLO, [], [])).binding!
    expect(b.fixHref).toBe('/acme/settings')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('alternatives', () => {
  const carts = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]

  it('are weekday-matched and forward-only', () => {
    // FAR is a Saturday and is over capacity.
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, carts))

    expect(out.verdict).toBe('closed')
    expect(out.alternatives).toEqual(['2026-12-12', '2026-12-19', '2026-12-26'])
    // every one of them is the SAME weekday, and every one is AFTER the ask
    for (const alt of out.alternatives) {
      expect(new Date(`${alt}T00:00:00.000Z`).getUTCDay()).toBe(6)
      expect(alt > FAR).toBe(true)
    }
  })

  it('skip a candidate that is itself not open', () => {
    const leads = [
      lead({ id: 'a', event_date: FAR }),
      lead({ id: 'b', event_date: FAR }),
      // the following Saturday is fully committed too
      lead({ id: 'c', event_date: FAR_2 }),
      lead({ id: 'd', event_date: FAR_2 }),
    ]
    const out = bookability(FAR, ctxFor(BUSINESS, leads, carts))
    expect(out.alternatives).not.toContain(FAR_2)
    expect(out.alternatives).toEqual(['2026-12-19', '2026-12-26', '2027-01-02'])
  })

  it('are empty on an open day — a list of other free Saturdays under a free Saturday is noise', () => {
    expect(bookability(FAR, ctxFor(BUSINESS, [], carts)).alternatives).toEqual([])
  })

  it('come back empty rather than wrong when nothing opens inside the horizon', () => {
    // Every Saturday for two years is over capacity.
    const leads: Lead[] = []
    for (let w = 0; w <= ALTERNATIVE_HORIZON_WEEKS + 2; w++) {
      const d = addDays(FAR, w * 7)
      leads.push(lead({ id: `x${w}`, event_date: d }), lead({ id: `y${w}`, event_date: d }))
    }
    const out = bookability(FAR, ctxFor(BUSINESS, leads, carts))
    expect(out.verdict).toBe('closed')
    expect(out.alternatives).toEqual([])
  })

  it('jump the whole prep window when the ask is a near date', () => {
    // A Saturday 3 days out: closed on lead time, and so are the next one (10
    // days) and… the one after that is 17 days out, which clears 14.
    const soon = '2026-08-29' // Saturday, 6 days out
    const ctx = ctxFor(SOLO, [], [])
    const out = bookability(soon, ctx)
    expect(out.verdict).toBe('closed')
    expect(out.alternatives[0]).toBe('2026-09-12') // 20 days out; 2026-09-05 is only 13
  })

  it('nextOpenDates never returns the date it was asked about', () => {
    const ctx = ctxFor(BUSINESS, [], carts)
    expect(nextOpenDates(FAR, ctx)).not.toContain(FAR)
  })

  /** The grid path asks 42 times per render, so it must not run the 26-week
   *  alternatives scan. Asserted as the ABSENCE of `alternatives` rather than an
   *  exact key list: pinning the whole shape made the test fail for the
   *  unrelated reason that a new provenance field was added, which tells you
   *  nothing about whether the cheap path is still cheap. */
  it('bindingConstraint is the cheap path — it computes no alternatives', () => {
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const ctx = ctxFor(BUSINESS, leads, carts)
    expect(Object.keys(bindingConstraint(FAR, ctx))).not.toContain('alternatives')
    expect(bookability(FAR, ctx).alternatives.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('serialisability', () => {
  /** The ctx crosses the RSC boundary into the grids. Map/Set would not survive
   *  a plain JSON round-trip, and a silently-empty radar reads as "all open" —
   *  the exact failure mode this feature exists to remove. */
  it('survives a JSON round-trip with the verdict unchanged', () => {
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const ctx = ctxFor(BUSINESS, leads, [unit({ id: 'k1', kind: 'mobile' })])
    const wire = JSON.parse(JSON.stringify(ctx)) as BookabilityCtx

    expect(wire).toEqual(ctx)
    expect(bookability(FAR, wire)).toEqual(bookability(FAR, ctx))
    expect(bookability(FAR, wire).verdict).toBe('closed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
/**
 * C1 — THE VERDICT MUST SEE THE JOBS THE COCKPIT BOOKS.
 *
 * Demand used to be read off `Lead.event_date` alone. But the grid renders
 * bookings from `Event.event_start`, and the day spine's own empty-day CTA
 * points at /new-event, which creates an Event with NO `lead_id` at all. So the
 * banner could say "nothing on file stands in the way of this day" directly
 * above that same day's job block. Three blind spots, one root cause:
 *
 *   1. an event with no lead behind it            — invisible
 *   2. the interior days of a multi-day job       — invisible (exact ===)
 *   3. an event moved off its lead's event_date   — counted on the wrong day
 *
 * …and one hazard in fixing it: a converted opportunity has BOTH an Event and a
 * Lead, so naively unioning them reports two carts needed where one is.
 */
describe('demand comes from the same records the grid renders', () => {
  const oneCart = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]
  const twoCarts = [...oneCart, unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' })]

  it('an EVENT with no lead_id occupies the day — the /new-event booking is seen', () => {
    // The exact path the day spine's own "Book a job" CTA takes.
    const ctx = ctxFor(BUSINESS, [], oneCart, [event({ id: 'e1', event_start: FAR })])
    const out = bookability(FAR, ctx)

    expect(out.verdict).not.toBe('open')
    expect(out.binding).toMatchObject({
      rule: 'capacity.at-capacity',
      inputs: { kind: 'mobile', demand: 1, supply: 1 },
    })
  })

  it('a multi-day job occupies its INTERIOR days, not just its start', () => {
    const ctx = ctxFor(BUSINESS, [], oneCart, [
      event({ id: 'e1', event_start: FAR, event_end: addDays(FAR, 2) }),
    ])
    for (const d of [FAR, addDays(FAR, 1), addDays(FAR, 2)]) {
      expect(bindingConstraint(d, ctx).binding?.rule, `day ${d}`).toBe('capacity.at-capacity')
    }
    // …and stops at the end date. The day after is untouched.
    expect(bindingConstraint(addDays(FAR, 3), ctx).verdict).toBe('open')
  })

  it('a converted opportunity counts ONCE — the event row, never both', () => {
    // The lead and its event are the same job. Double-counted, this is 2 jobs on
    // 1 cart ⇒ `capacity.over` (closed). Counted once it is 1 on 1 ⇒ at-capacity.
    const converted = lead({ id: 'l1', event_date: FAR, stage: 'closed_won' })
    const ctx = ctxFor(BUSINESS, [converted], oneCart, [
      event({ id: 'e1', event_start: FAR, lead_id: 'l1' }),
    ])
    const out = bindingConstraint(FAR, ctx)

    expect(out.binding?.rule).toBe('capacity.at-capacity')
    expect(out.binding?.inputs).toMatchObject({ demand: 1, supply: 1 })
  })

  it('a converted opportunity counts once on the DEGRADED arm too', () => {
    // Two records, one job: the backstop's ≥2 rule must not fire on it.
    const converted = lead({ id: 'l1', event_date: FAR, stage: 'closed_won' })
    const ctx = ctxFor(SOLO, [converted], [], [event({ id: 'e1', event_start: FAR, lead_id: 'l1' })])
    expect(bindingConstraint(FAR, ctx).binding?.rule).not.toBe('capacity.unknown')
  })

  it('an EVENT-ONLY reschedule moves the demand with the event, not the lead', () => {
    // actions/calendar-bulk.ts moves Event.event_start and leaves Lead.event_date
    // where it was. The day the job is actually ON is the one that must be full.
    const stale = lead({ id: 'l1', event_date: FAR, stage: 'closed_won' })
    const ctx = ctxFor(BUSINESS, [stale], oneCart, [
      event({ id: 'e1', event_start: FAR_2, lead_id: 'l1' }),
    ])
    expect(bindingConstraint(FAR_2, ctx).binding?.rule).toBe('capacity.at-capacity')
    // …and the lead's abandoned date is free again.
    expect(bindingConstraint(FAR, ctx).verdict).toBe('open')
  })

  it('an event and an UNRELATED lead on one day are two jobs, not one', () => {
    const ctx = ctxFor(BUSINESS, [lead({ id: 'l1', event_date: FAR })], oneCart, [
      event({ id: 'e1', event_start: FAR }),
    ])
    const out = bindingConstraint(FAR, ctx)
    expect(out.verdict).toBe('closed')
    expect(out.binding).toMatchObject({ rule: 'capacity.over', inputs: { demand: 2, supply: 1 } })
  })

  it('an archived or undated event is not demand — it is on no calendar surface', () => {
    const ctx = ctxFor(BUSINESS, [], oneCart, [
      event({ id: 'e1', event_start: FAR, status: 'archived' }),
      { ...event({ id: 'e2', event_start: FAR }), event_start: '', event_end: '' },
    ])
    expect(bookability(FAR, ctx).verdict).toBe('open')
  })

  it('carries the source lead’s on-site mode onto the event’s days', () => {
    const onsite = lead({ id: 'l1', event_date: FAR, stage: 'closed_won', delivery_mode: 'onsite' })
    // Carts only: no room exists, so an on-site job is over on venue.
    const ctx = ctxFor(BUSINESS, [onsite], twoCarts, [
      event({ id: 'e1', event_start: FAR, lead_id: 'l1' }),
    ])
    expect(bindingConstraint(FAR, ctx).binding).toMatchObject({
      rule: 'capacity.over',
      inputs: { kind: 'venue', demand: 1, supply: 0 },
    })
  })

  it('carries the source lead’s pinned unit onto the event’s days', () => {
    const three = [...twoCarts, unit({ id: 'k3', kind: 'mobile' })]
    const pinned = lead({ id: 'l1', event_date: FAR, stage: 'closed_won', assigned_units: { mobile: 'k1' } })
    const other = lead({ id: 'l2', event_date: FAR, assigned_units: { mobile: 'k1' } })
    const ctx = ctxFor(BUSINESS, [pinned, other], three, [
      event({ id: 'e1', event_start: FAR, lead_id: 'l1' }),
    ])
    expect(bindingConstraint(FAR, ctx).binding).toMatchObject({
      rule: 'capacity.unit-clash',
      inputs: { unit: 'Kart 1', jobs: 2 },
    })
  })

  /** The sacred backstop, re-checked with events in the mix: a business org that
   *  has defined no units must still not be flagged on every date. */
  it('the zero-units backstop survives events being folded into demand', () => {
    const ctx = ctxFor(BUSINESS, [], [], [
      event({ id: 'e1', event_start: FAR }),
      event({ id: 'e2', event_start: FAR_2, event_end: addDays(FAR_2, 3) }),
    ])
    expect(ctx.radar.mode).toBe('degraded')
    for (const d of [FAR, FAR_2, addDays(FAR_2, 1), '2026-12-26']) {
      expect(bookability(d, ctx).verdict, `day ${d}`).toBe('open')
    }
  })

  /** A typo'd `event_end` year is the realistic case. The span is bounded so it
   *  costs a fixed amount of work instead of ~350,000 synthetic records; the job
   *  is never dropped, it just stops consuming days past the ceiling. */
  it('bounds a malformed span instead of synthesising a millennium of demand', () => {
    const ctx = ctxFor(SOLO, [], [], [event({ id: 'e1', event_start: FAR, event_end: '2999-12-31' })])
    const last = addDays(FAR, MAX_EVENT_SPAN_DAYS)
    expect(bindingConstraint(last, ctx).basis?.kind).toBe('unverified')
    expect(bindingConstraint(addDays(last, 1), ctx).basis?.kind).toBe('clear')
  })

  it('two events on one day are a conflict on the degraded arm', () => {
    const ctx = ctxFor(SOLO, [], [], [
      event({ id: 'e1', event_start: FAR }),
      event({ id: 'e2', event_start: FAR }),
    ])
    expect(bindingConstraint(FAR, ctx).binding?.rule).toBe('capacity.unknown')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
/**
 * C2 — `open` MUST NOT CLAIM MORE THAN IT CAN KNOW.
 *
 * On the degraded arm there is no capacity model at all: `tight` fires only at
 * ≥2 jobs, and everything else fell through to an unqualified `open` with
 * `binding: null` — zero provenance on the verdict that most needs a caveat.
 * A one-cart operator with one wedding on Saturday was told Saturday was open.
 *
 * The fix is a second provenance channel — `basis` — naming which of two things
 * an `open` verdict means:
 *   • `clear`      — nothing on file, or a real model reporting real headroom
 *   • `unverified` — the day already carries a job and we cannot say whether
 *                    that is over the operator's limit
 */
describe('the basis of an OPEN verdict', () => {
  const oneCart = [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]

  it('is `clear` on an empty day, and says only what "nothing on file" supports', () => {
    const b = bookability(FAR, ctxFor(SOLO, [], [])).basis!
    expect(b.kind).toBe('clear')
    expect(b.booked).toBe(0)
    expect(b.reason).toMatch(/nothing on file/i)
    expect(b.fixHref).toBeUndefined()
  })

  it('is `unverified` when the degraded arm has a job on the day', () => {
    const ctx = ctxFor(SOLO, [lead({ id: 'a', event_date: FAR })], [])
    const out = bookability(FAR, ctx)

    // Still open — escalating to `tight` would flag every single-job day for
    // every solo org, which is exactly the false flag the backstop prevents.
    expect(out.verdict).toBe('open')
    expect(out.binding).toBeNull()
    expect(out.basis).toMatchObject({ kind: 'unverified', booked: 1, fixHref: '/acme/capacity' })
    // It names its ignorance, the way `capacity.unknown` does.
    expect(out.basis!.reason).toMatch(/can't tell/i)
    expect(out.basis!.reason).toMatch(/no cart or room capacity is set up/i)
    // …and it must NOT claim the thing it cannot support.
    expect(out.basis!.reason).not.toMatch(/nothing on file/i)
  })

  it('is `unverified` for a booked EVENT on the degraded arm too', () => {
    const ctx = ctxFor(SOLO, [], [], [event({ id: 'e1', event_start: FAR })])
    expect(bookability(FAR, ctx).basis).toMatchObject({ kind: 'unverified', booked: 1 })
  })

  it('is `clear` on the capacity arm even with a job on the day — the model KNOWS', () => {
    const twoCarts = [...oneCart, unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' })]
    const b = bookability(FAR, ctxFor(BUSINESS, [lead({ id: 'a', event_date: FAR })], twoCarts)).basis!
    expect(b.kind).toBe('clear')
    expect(b.booked).toBe(1)
    // Provenance: the numbers behind the "yes", not a bare assertion.
    expect(b.reason).toMatch(/1 cart still free/)
  })

  it('is null on every non-open verdict — `binding` and `basis` never coexist', () => {
    const leads = [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })]
    const over = bookability(FAR, ctxFor(BUSINESS, leads, oneCart))
    expect(over.verdict).toBe('closed')
    expect(over.basis).toBeNull()
    expect(over.binding).not.toBeNull()
  })

  it('rides the RSC wire — bindingConstraint carries it on the grid path too', () => {
    const ctx = ctxFor(SOLO, [lead({ id: 'a', event_date: FAR })], [])
    const wire = JSON.parse(JSON.stringify(ctx)) as BookabilityCtx
    expect(bindingConstraint(FAR, wire).basis).toEqual(bindingConstraint(FAR, ctx).basis)
    expect(bindingConstraint(FAR, wire).basis?.kind).toBe('unverified')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('alternatives are never a double-booking', () => {
  it('nextOpenDates skips a day the degraded arm cannot vouch for', () => {
    // One job on the next Saturday. The rail renders these as <Link>s, so
    // offering it is offering the operator a double-booking in one tap.
    const ctx = ctxFor(SOLO, [lead({ id: 'a', event_date: FAR_2 })], [])
    const out = nextOpenDates(FAR, ctx)

    expect(out).not.toContain(FAR_2)
    expect(out).toEqual(['2026-12-19', '2026-12-26', '2027-01-02'])
  })

  it('skips a day held by an EVENT with no lead behind it', () => {
    const ctx = ctxFor(SOLO, [], [], [event({ id: 'e1', event_start: FAR_2 })])
    expect(nextOpenDates(FAR, ctx)).not.toContain(FAR_2)
  })

  it('skips every interior day of a multi-day job', () => {
    // A job running Sat 12th → Sat 19th. Both Saturdays are inside it.
    const ctx = ctxFor(SOLO, [], [], [
      event({ id: 'e1', event_start: FAR_2, event_end: '2026-12-19' }),
    ])
    const out = nextOpenDates(FAR, ctx)
    expect(out).not.toContain(FAR_2)
    expect(out).not.toContain('2026-12-19')
    expect(out[0]).toBe('2026-12-26')
  })

  it('still offers a capacity-arm day with real headroom — the model can vouch for it', () => {
    const carts = [unit({ id: 'k1', kind: 'mobile' }), unit({ id: 'k2', kind: 'mobile' })]
    const ctx = ctxFor(BUSINESS, [lead({ id: 'a', event_date: FAR_2 })], carts)
    expect(nextOpenDates(FAR, ctx)).toContain(FAR_2)
  })
})
