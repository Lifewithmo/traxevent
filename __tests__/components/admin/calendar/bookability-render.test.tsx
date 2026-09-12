import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MonthGrid } from '@/components/admin/calendar/MonthGrid'
import { WeekGrid } from '@/components/admin/calendar/WeekGrid'
import { DaySpine } from '@/components/admin/calendar/DaySpine'
import { CalendarLeftRail } from '@/components/admin/calendar/CalendarLeftRail'
import { BookabilityProvider } from '@/components/admin/calendar/bookability-context'
import { BookabilityMark } from '@/components/admin/calendar/BookabilityMark'
import { bookability, buildBookabilityCtx, type BookabilityCtx } from '@/lib/calendar-bookability'
import type { DayDetail } from '@/actions/calendar'
import type { CalendarItem } from '@/lib/calendar'
import type { CapacityUnit, Event, Lead, Org } from '@/lib/types'
import type { WeekRollup } from '@/lib/calendar-week'

// The grids import the reschedule engine, which imports its server action.
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: vi.fn().mockResolvedValue({ moved: 1, failures: [] }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/acme/calendar',
}))

/**
 * THE RENDERED VERDICT.
 *
 * The pure function is covered in __tests__/lib/calendar-bookability.test.ts;
 * this file is about the two things that can only fail on screen:
 *
 *  1. the NON-COLOUR CHANNEL. This branch just fixed a WCAG 1.4.1 failure on the
 *     calendar's kind dots. Shading a day cell and calling it done would put the
 *     same bug back one component over, so every assertion about a tint is
 *     paired with an assertion about a shape AND about text.
 *  2. QUIET WHEN OPEN. A calendar that marks every free day is a calendar that
 *     has stopped meaning anything.
 */

const TODAY = '2026-08-23'
const FAR = '2026-12-05' // Saturday, 104 days out — clear of any prep window
const MONTH = '2026-12'

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

function ctxFor(
  leads: Lead[],
  units: CapacityUnit[],
  org: Pick<Org, 'plan'> = { plan: 'business' },
  events: Event[] = []
): BookabilityCtx {
  return buildBookabilityCtx({ orgSlug: 'acme', org, leads, units, events, today: TODAY })
}

/** One cart, two jobs on FAR ⇒ over capacity ⇒ closed. */
const OVER = () =>
  ctxFor([lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })], [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })])

/** Two carts, two jobs on FAR ⇒ at capacity ⇒ tight. */
const TIGHT = () =>
  ctxFor(
    [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })],
    [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' }), unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' })]
  )

/** Nothing booked, three carts ⇒ open everywhere past the prep window. */
const CLEAR = () => ctxFor([], [unit({ id: 'k1', kind: 'mobile' }), unit({ id: 'k2', kind: 'mobile' })])

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

/**
 * THE ANCHOR PERSONA'S DAY: a solo operator on the degraded arm (no capacity
 * model at all) with ONE job on FAR. `tight` needs two jobs, so this comes back
 * `open` — and it used to come back with "nothing on file stands in the way of
 * this day" printed above that job. It is the single most common state on the
 * whole surface, so it gets its own fixture.
 */
const UNVERIFIED = () => ctxFor([lead({ id: 'a', event_date: FAR })], [], { plan: 'standard' })

const boxEl = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="month-cell-box"][data-day="${d}"]`) as HTMLElement
const cellLink = (c: HTMLElement, d: string) =>
  c.querySelector(`a[data-slot="month-cell"][data-day="${d}"]`) as HTMLElement

/** One unrelated item, so the grid renders its cells rather than the onboarding
 *  empty state. Deliberately NOT on FAR — the point of several tests below is
 *  that FAR's own cell holds nothing. */
const FILLER: CalendarItem[] = [
  { id: 'f', title: 'Some job', date: '2026-12-01', kind: 'event', href: '/acme/x' },
]

function month(ctx: BookabilityCtx | null, items: CalendarItem[] = FILLER) {
  return render(
    <BookabilityProvider ctx={ctx}>
      <MonthGrid orgSlug="acme" items={items} month={MONTH} today={TODAY} />
    </BookabilityProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
describe('MonthGrid — the verdict in a month cell', () => {
  /**
   * The grid is the ONE surface that needed no narrowing for an unverified
   * `open`, and the reason is worth pinning: the cell already renders the job.
   * It makes no claim in words, so there is nothing to walk back — and putting a
   * third glyph on every single-job day of every solo org's calendar would put
   * ink on the default state, which is the thing BookabilityMark's own doc
   * forbids. The narrowing belongs where sentences are spoken (the spine) and
   * where days are OFFERED as taps (the rail).
   */
  it('puts no mark on an open day it cannot fully vouch for — the cell shows the job itself', () => {
    const booked: CalendarItem[] = [
      ...FILLER,
      { id: 'j', title: 'Wedding', date: FAR, kind: 'event', href: '/acme/x' },
    ]
    const { container } = month(UNVERIFIED(), booked)
    const box = boxEl(container, FAR)

    expect(within(box).queryByTestId('bookability-mark')).toBeNull()
    expect(box.className).not.toContain('warn-bg')
    // …and the cell discloses the booking, so nothing here reads as "empty".
    expect(cellLink(container, FAR).getAttribute('aria-label')).toContain('1 Booked event')
  })

  it('marks a closed day with a SHAPE, not colour alone', () => {
    const { container } = month(OVER())
    const box = boxEl(container, FAR)

    // 1. shape — a distinct silhouette that survives greyscale and 8px
    const mark = within(box).getByTestId('bookability-mark')
    expect(mark).toHaveAttribute('data-verdict', 'closed')
    expect(mark.querySelector('svg')).toBeTruthy()

    // 2. text — carried on the cell link, because its aria-label swallows the
    //    subtree (a label on the mark itself would never be announced)
    expect(cellLink(container, FAR).getAttribute('aria-label')).toContain('Closed for booking')

    // 3. …and TEXTURE — the diagonal hatch every scheduling product uses for an
    //    unavailable slot. Load-bearing, not decorative: `bg-muted/60` over this
    //    theme's page background is a ~1% luminance step (measured in the
    //    browser), so without the hatch an 8px glyph was carrying the whole
    //    verdict on a 42-cell grid.
    expect(box.getAttribute('style')).toContain('repeating-linear-gradient')

    // 4. …and only then colour
    expect(box.className).toContain('bg-muted/60')
  })

  it('the cell text names the binding constraint, not just the verdict', () => {
    const { container } = month(OVER())
    const label = cellLink(container, FAR).getAttribute('aria-label')!
    expect(label).toContain('2 jobs need a cart')
    expect(label).toContain('only 1 cart is available')
  })

  it('never lets colour be the only channel — the shape is present on tight too', () => {
    const { container } = month(TIGHT())
    const box = boxEl(container, FAR)
    expect(within(box).getByTestId('bookability-mark')).toHaveAttribute('data-verdict', 'tight')
    expect(cellLink(container, FAR).getAttribute('aria-label')).toContain('Tight for booking')
    expect(box.className).toContain('bg-[var(--warn-bg)]')
    // The hatch belongs to `closed` alone — it is what makes the two states
    // tellable apart at a glance, so tight must NOT wear it.
    expect(box.getAttribute('style') ?? '').not.toContain('repeating-linear-gradient')
  })

  it('says nothing at all on an open day — no mark, no tint, no verdict in the label', () => {
    const { container } = month(CLEAR())
    const box = boxEl(container, FAR)
    expect(within(box).queryByTestId('bookability-mark')).toBeNull()
    expect(box).not.toHaveAttribute('data-verdict')
    expect(box.className).not.toContain('bg-muted/60')
    expect(box.className).not.toContain('warn-bg')
    expect(box.getAttribute('style') ?? '').not.toContain('repeating-linear-gradient')
    expect(cellLink(container, FAR).getAttribute('aria-label')).not.toContain('for booking')
  })

  it('still says "nothing scheduled" as well as the verdict — an empty day is not a free one', () => {
    const { container } = month(OVER())
    const label = cellLink(container, FAR).getAttribute('aria-label')!
    // The two claims are DIFFERENT and both have to be audible.
    expect(label).toContain('nothing scheduled')
    expect(label).toContain('Closed for booking')
  })

  it('leaves days behind today unmarked — nobody asks whether they were free last Tuesday', () => {
    // A past month, every day of which is technically closed on lead time.
    const { container } = render(
      <BookabilityProvider ctx={OVER()}>
        <MonthGrid
          orgSlug="acme"
          items={[{ id: 'g', title: 'Old job', date: '2026-05-09', kind: 'event', href: '/acme/x' }]}
          month="2026-05"
          today={TODAY}
        />
      </BookabilityProvider>
    )
    expect(container.querySelectorAll('[data-testid="bookability-mark"]')).toHaveLength(0)
  })

  it('renders the grid instead of the empty state when a verdict has something to say', () => {
    // Nothing at all on the calendar in December, but December 5 is closed.
    const { container } = month(OVER(), [])
    expect(screen.queryByText('Nothing scheduled this month')).toBeNull()
    expect(boxEl(container, FAR)).toBeTruthy()
  })

  it('keeps the onboarding empty state when there is genuinely nothing to say', () => {
    month(null, [])
    expect(screen.getByText('Nothing scheduled this month')).toBeInTheDocument()
  })

  it('renders exactly as before when there is no bookability context', () => {
    const { container } = render(
      <BookabilityProvider ctx={null}>
        <MonthGrid orgSlug="acme" items={FILLER} month={MONTH} today={TODAY} />
      </BookabilityProvider>
    )
    expect(container.querySelectorAll('[data-testid="bookability-mark"]')).toHaveLength(0)
  })

  it('does not regress the drag affordances', () => {
    const { container } = month(OVER())
    // The box is still the drop target and the link is still the stretched overlay.
    expect(boxEl(container, FAR)).toHaveAttribute('data-drop-day', FAR)
    expect(cellLink(container, FAR).tagName).toBe('A')
    // …and an <a> still contains no interactive content.
    expect(cellLink(container, FAR).querySelector('button, a, [tabindex]')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('BookabilityMark — the shape channel actually distinguishes', () => {
  /**
   * Found by mutation testing: every other assertion in this file checks that a
   * mark IS THERE and that `data-verdict` says which one, so swapping `closed`'s
   * silhouette for `tight`'s left the whole suite green — while destroying the
   * only channel a colour-blind or greyscale reader has. "There is a shape" is
   * not the requirement; "the shapes are TELLABLE APART" is.
   */
  it('draws a different silhouette for tight and for closed', () => {
    const { container: t } = render(<BookabilityMark verdict="tight" />)
    const { container: c } = render(<BookabilityMark verdict="closed" />)
    const geometry = (el: HTMLElement) => el.querySelector('svg')!.innerHTML

    expect(geometry(t).length).toBeGreaterThan(0)
    expect(geometry(c).length).toBeGreaterThan(0)
    expect(geometry(t)).not.toEqual(geometry(c))
  })

  it('carries its own name when nothing above it does', () => {
    render(<BookabilityMark verdict="closed" />)
    expect(screen.getByText('Closed for booking')).toBeInTheDocument()
  })

  it('draws nothing at all for open', () => {
    const { container } = render(<BookabilityMark verdict="open" />)
    expect(container.innerHTML).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('WeekGrid — the verdict in a day header', () => {
  const header = (c: HTMLElement, d: string) =>
    c.querySelector(`a[data-slot="week-day-header"][data-day="${d}"]`) as HTMLElement

  function week(ctx: BookabilityCtx | null) {
    return render(
      <BookabilityProvider ctx={ctx}>
        <WeekGrid orgSlug="acme" items={FILLER} weekStart="2026-11-30" today={TODAY} />
      </BookabilityProvider>
    )
  }

  it('marks a closed day with a shape AND readable text, not colour alone', () => {
    const { container } = week(OVER())
    const h = header(container, FAR)
    expect(within(h).getByTestId('bookability-mark')).toHaveAttribute('data-verdict', 'closed')
    expect(h.textContent).toContain('Closed for booking')
    expect(h.textContent).toContain('2 jobs need a cart')
    expect(h.className).toContain('bg-muted/60')
  })

  it('says nothing on an open day', () => {
    const { container } = week(CLEAR())
    const h = header(container, FAR)
    expect(within(h).queryByTestId('bookability-mark')).toBeNull()
    expect(h).not.toHaveAttribute('data-verdict')
    expect(h.textContent).not.toContain('for booking')
  })

  it('keeps the mark on the inverted "today" header, where the tint is suppressed', () => {
    const { container } = render(
      <BookabilityProvider ctx={ctxFor([], [])}>
        {/* today falls inside the prep window, so it is lead-time closed */}
        <WeekGrid
          orgSlug="acme"
          items={[{ id: 'h', title: 'This week', date: '2026-08-19', kind: 'event', href: '/acme/x' }]}
          weekStart="2026-08-17"
          today={TODAY}
        />
      </BookabilityProvider>
    )
    const h = header(container, TODAY)
    expect(h.className).toContain('bg-foreground') // today's own treatment wins
    expect(h.className).not.toContain('bg-muted/60')
    // …and the shape + text channel survives it, which is the point.
    expect(within(h).getByTestId('bookability-mark')).toHaveAttribute('data-verdict', 'closed')
    expect(h.textContent).toContain("can't be prepped in time")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DaySpine — the verdict stated in full', () => {
  const detail = (ymd: string): DayDetail => ({
    ymd,
    events: [],
    tasks: [],
    blockers: [],
    drops: [],
    invoicesDue: [],
    related: {},
  })

  it('answers over an EMPTY day — the exact place "Nothing scheduled" used to mislead', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    // Both statements are present, and they are different claims.
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument()
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    expect(banner).toHaveAttribute('data-verdict', 'closed')
    expect(within(banner).getByText('Closed for booking')).toBeInTheDocument()
  })

  it('names the binding constraint in a sentence', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    expect(
      screen.getByText(/Dec 5 is already over capacity — 2 jobs need a cart and only 1 cart is available\./)
    ).toBeInTheDocument()
  })

  it('shows the inputs the rule fired on AND a link to the field behind it', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    // Provenance: the machine rule id and the concrete values.
    expect(banner.textContent).toContain('capacity.over')
    expect(banner.textContent).toContain('demand=2')
    expect(banner.textContent).toContain('supply=1')
    // …and the fix, at source.
    expect(within(banner).getByRole('link', { name: /check the setting/i })).toHaveAttribute(
      'href',
      '/acme/capacity'
    )
  })

  it('offers the nearest open Saturdays as one-tap links', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    expect(within(banner).getByText('Next open Saturday')).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: 'Dec 12' })).toHaveAttribute(
      'href',
      '/acme/calendar/2026-12-12'
    )
  })

  it('NEVER blocks — the book-a-job action is still live on a closed day', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    expect(screen.getByRole('link', { name: 'Book a job' })).toHaveAttribute(
      'href',
      `/acme/new-event?date=${FAR}`
    )
  })

  /**
   * Found in the browser, not by a test: `opacity-80` on the 10px provenance
   * line measured 3.43:1 in light mode against a 4.5:1 AA floor. No assertion in
   * this file could see it — a class name carries no contrast ratio — so the
   * guard has to be structural: the banner's text may not be dimmed by an
   * opacity utility at all, and its hierarchy comes from size/case/family.
   */
  it('never dims its own text with an opacity utility (WCAG 1.4.3)', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, OVER())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    const dimmed = [banner, ...banner.querySelectorAll('*')].filter((el) =>
      /(^|\s)opacity-\d/.test((el as HTMLElement).className || '')
    )
    expect(dimmed).toEqual([])
  })

  it('is one quiet line on an open day — no panel, no tint', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, CLEAR())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    expect(banner).toHaveAttribute('data-verdict', 'open')
    expect(banner).toHaveAttribute('data-basis', 'clear')
    expect(banner.className).not.toContain('warn-bg')
    expect(banner.className).not.toContain('bg-muted')
    expect(banner.textContent).toContain('Open for booking')
    // The DATE, not "this day": the sentence is the engine's, carried on the
    // basis, not a string the component invented. Mutation-found — a hardcoded
    // "nothing on file stands in the way of this day" satisfied the looser
    // wording while making the unverified case wrong.
    expect(banner.textContent).toMatch(/nothing on file stands in the way of Dec 5\./i)
  })

  /**
   * THE SELF-CONTRADICTION, closed.
   *
   * The degraded arm cannot reach `tight` on one job, so this day is `open` —
   * and the banner used to answer it with a hardcoded "nothing on file stands in
   * the way of this day", rendered directly above that same day's job block. The
   * module already knew it could not tell (`capacity.unknown` says so one
   * severity up); the hedge just was not applied at the frequent case.
   */
  it('never claims "nothing on file" over a day that already carries a job', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, UNVERIFIED())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement

    expect(banner).toHaveAttribute('data-basis', 'unverified')
    // It leads with the claim it CAN support…
    expect(banner.textContent).toContain('Nothing else on file')
    // …names what it does not know, in the module's own voice…
    expect(banner.textContent).toMatch(/One job already shares Dec 5/)
    expect(banner.textContent).toMatch(/can't tell/i)
    // …and does NOT make the claim it could not substantiate.
    expect(banner.textContent).not.toMatch(/nothing on file stands in the way/i)
  })

  it('links an unverified day to the fix, the way capacity.unknown does', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, UNVERIFIED())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    expect(within(banner).getByRole('link', { name: 'Set up capacity' })).toHaveAttribute(
      'href',
      '/acme/capacity'
    )
  })

  /** The claim narrows; the ANSWER does not. Tinting an `open` day would flag the
   *  default state of every solo org — the false-flag class the zero-units
   *  backstop exists to prevent. */
  it('stays a quiet line on an unverified day — no panel, no tint, no mark', () => {
    render(
      <DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} bookability={bookability(FAR, UNVERIFIED())} />
    )
    const banner = document.querySelector('[data-slot="bookability-banner"]') as HTMLElement
    expect(banner).toHaveAttribute('data-verdict', 'open')
    expect(banner.className).not.toContain('warn-bg')
    expect(banner.className).not.toContain('bg-muted')
    expect(banner.querySelector('[data-slot="bookability-mark"]')).toBeNull()
  })

  it('renders no banner at all when no verdict was computed', () => {
    render(<DaySpine orgSlug="acme" today={TODAY} detail={detail(FAR)} />)
    expect(document.querySelector('[data-slot="bookability-banner"]')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('CalendarLeftRail — the standing answer', () => {
  const rollup: WeekRollup = {
    eventCount: 0,
    guestCount: 0,
    tentativeCount: 0,
    taskCount: 0,
    dueAmount: 0,
    overdueDueAmount: 0,
    blockerCount: 0,
    bookedValue: 0,
  }

  const railWith = (ctx: BookabilityCtx | null) =>
    render(
      <CalendarLeftRail orgSlug="acme" today={TODAY} rollup={rollup} runway={[]} bookability={ctx} />
    )

  it('answers "what Saturdays have you got" without navigating anywhere', () => {
    railWith(CLEAR())
    const block = document.querySelector('[data-slot="rail-bookability"]') as HTMLElement
    expect(within(block).getByText('Next open Saturday')).toBeInTheDocument()
    // TODAY is a Sunday; the next Saturday is Aug 29 — but that is 6 days out and
    // cannot be prepped, so the first offerable one clears the 14-day window.
    expect(within(block).getByRole('link', { name: 'Sep 12' })).toHaveAttribute(
      'href',
      '/acme/calendar/2026-09-12'
    )
  })

  /**
   * The key is STILL always on — no disclosure, no tooltip. The rail's
   * composition pass moved it out of the next-open block and into the rail's
   * one Key footer, beside the kind legend it shares a grammar with: two
   * legends in two different places was two boxes doing one job.
   */
  it('carries the key for the mark grammar, so the glyphs need no memorising', () => {
    railWith(CLEAR())
    const key = document.querySelector('[data-rail-section="key"]') as HTMLElement
    expect(key).not.toBeNull()
    expect(within(key).getByText(/Tight — capacity is spoken for/)).toBeInTheDocument()
    expect(within(key).getByText(/Closed — something blocks it/)).toBeInTheDocument()
    // "no mark" is itself a value in this grammar, so it is spelled out too.
    expect(within(key).getByText(/No mark — open to book/)).toBeInTheDocument()
    // …and it is not behind any disclosure: nothing in the footer is collapsed.
    const collapsed = within(key).queryAllByRole('button', { expanded: false })
    expect(collapsed.every((b) => !b.textContent?.match(/tight|closed|no mark/i))).toBe(true)
    // the kind legend it now sits with is present in the SAME footer
    expect(within(key).getByText('Key')).toBeInTheDocument()
  })

  /**
   * THE ONE-TAP DOUBLE-BOOKING, closed.
   *
   * These chips are <Link>s: a date offered here is a date the operator taps and
   * books. On the degraded arm a Saturday already carrying a job still comes back
   * `open` — we cannot substantiate anything stronger — so offering it handed
   * them a double-booking on the strength of a verdict that says it cannot tell.
   */
  it('never offers a Saturday that already carries a job', () => {
    // Sep 12 is the first Saturday clear of the 14-day prep window (see above),
    // so it is the chip this rail would otherwise lead with.
    railWith(ctxFor([], [], { plan: 'standard' }, [event({ id: 'e1', event_start: '2026-09-12' })]))
    const block = document.querySelector('[data-slot="rail-bookability"]') as HTMLElement

    expect(within(block).queryByRole('link', { name: 'Sep 12' })).toBeNull()
    expect(within(block).getByRole('link', { name: 'Sep 19' })).toHaveAttribute(
      'href',
      '/acme/calendar/2026-09-19'
    )
  })

  /** …but a capacity-arm day with REAL headroom stays offerable. Refusing to
   *  offer 1-of-3 carts would under-sell availability the model can vouch for —
   *  the opposite failure, and just as expensive. */
  it('still offers a Saturday the capacity model can vouch for', () => {
    const carts = [unit({ id: 'k1', kind: 'mobile' }), unit({ id: 'k2', kind: 'mobile' })]
    railWith(ctxFor([lead({ id: 'a', event_date: '2026-09-12' })], carts))
    const block = document.querySelector('[data-slot="rail-bookability"]') as HTMLElement
    expect(within(block).getByRole('link', { name: 'Sep 12' })).toBeInTheDocument()
  })

  it('hides the whole block when there is no context', () => {
    railWith(null)
    expect(document.querySelector('[data-slot="rail-bookability"]')).toBeNull()
  })
})
