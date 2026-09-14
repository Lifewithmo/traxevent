import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import { BookabilityBanner } from '@/components/admin/calendar/BookabilityBanner'
import { bookability, buildBookabilityCtx, type BookabilityCtx } from '@/lib/calendar-bookability'
import type { CapacityUnit, Lead, Org } from '@/lib/types'

/**
 * THE BANNER AS A STANDALONE BRICK.
 *
 * DaySpine's rendering of the verdict is covered end-to-end in
 * __tests__/components/admin/calendar/bookability-render.test.tsx; this file
 * pins the TWO things the extraction added, which only exist off the calendar:
 *
 *  1. `onPickAlternative` — in the New-opportunity form, "how about the 20th?"
 *     must SET THE DATE FIELD, not navigate away mid-phone-call. With the prop,
 *     alternative chips are <button>s firing the callback; without it they stay
 *     the calendar Links they always were. Fix-links navigate in BOTH modes —
 *     "check the setting behind this" is a different surface by definition.
 *  2. `className` — the host merges its own spacing onto the banner's root,
 *     whichever of the two branches (open line / verdict panel) renders.
 */

const TODAY = '2026-08-23'
const FAR = '2026-12-05' // Saturday, 104 days out — clear of any prep window

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
  org: Pick<Org, 'plan'> = { plan: 'business' }
): BookabilityCtx {
  return buildBookabilityCtx({ orgSlug: 'acme', org, leads, units, events: [], today: TODAY })
}

/** One cart, two jobs on FAR ⇒ over capacity ⇒ closed, with alternatives. */
const OVER = () =>
  ctxFor(
    [lead({ id: 'a', event_date: FAR }), lead({ id: 'b', event_date: FAR })],
    [unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })]
  )

/** Nothing booked, two carts ⇒ open (basis: clear) past the prep window. */
const CLEAR = () => ctxFor([], [unit({ id: 'k1', kind: 'mobile' }), unit({ id: 'k2', kind: 'mobile' })])

/** Degraded arm, one job on FAR ⇒ open (basis: unverified) with a fix link. */
const UNVERIFIED = () => ctxFor([lead({ id: 'a', event_date: FAR })], [], { plan: 'standard' })

const banner = () => document.querySelector('[data-slot="bookability-banner"]') as HTMLElement

// ─────────────────────────────────────────────────────────────────────────────
describe('BookabilityBanner — alternative chips', () => {
  it('renders alternatives as calendar Links when no onPickAlternative is given', () => {
    render(<BookabilityBanner orgSlug="acme" bookability={bookability(FAR, OVER())} />)
    const b = banner()
    expect(b).toHaveAttribute('data-verdict', 'closed')
    const chip = within(b).getByRole('link', { name: 'Dec 12' })
    expect(chip).toHaveAttribute('href', '/acme/calendar/2026-12-12')
    // No button chips in link mode.
    expect(within(b).queryByRole('button', { name: 'Dec 12' })).toBeNull()
  })

  it('renders alternatives as buttons that fire onPickAlternative(ymd) when the prop is present', () => {
    const onPick = vi.fn()
    render(
      <BookabilityBanner orgSlug="acme" bookability={bookability(FAR, OVER())} onPickAlternative={onPick} />
    )
    const b = banner()
    const chip = within(b).getByRole('button', { name: 'Dec 12' })
    // type="button": inside the New-opportunity <form>, a chip tap must never
    // fall through to a submit.
    expect(chip).toHaveAttribute('type', 'button')
    fireEvent.click(chip)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('2026-12-12')
    // …and the Link form of the chip is gone.
    expect(within(b).queryByRole('link', { name: 'Dec 12' })).toBeNull()
  })

  it('keeps the fix-link a Link even in button mode — fixing a setting IS a navigation', () => {
    render(
      <BookabilityBanner orgSlug="acme" bookability={bookability(FAR, OVER())} onPickAlternative={vi.fn()} />
    )
    expect(within(banner()).getByRole('link', { name: /check the setting/i })).toHaveAttribute(
      'href',
      '/acme/capacity'
    )
  })

  it('keeps the open branch fix-link a Link in button mode too', () => {
    render(
      <BookabilityBanner
        orgSlug="acme"
        bookability={bookability(FAR, UNVERIFIED())}
        onPickAlternative={vi.fn()}
      />
    )
    const b = banner()
    expect(b).toHaveAttribute('data-verdict', 'open')
    expect(b).toHaveAttribute('data-basis', 'unverified')
    expect(within(b).getByRole('link', { name: 'Set up capacity' })).toHaveAttribute('href', '/acme/capacity')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('BookabilityBanner — className merges onto the root of both branches', () => {
  it('lands on the quiet open line', () => {
    render(<BookabilityBanner orgSlug="acme" bookability={bookability(FAR, CLEAR())} className="mt-0 px-0" />)
    const b = banner()
    expect(b).toHaveAttribute('data-verdict', 'open')
    expect(b).toHaveAttribute('data-basis', 'clear')
    expect(b.className).toContain('mt-0')
    expect(b.className).toContain('px-0')
  })

  it('lands on the verdict panel', () => {
    render(<BookabilityBanner orgSlug="acme" bookability={bookability(FAR, OVER())} className="mx-0" />)
    const b = banner()
    expect(b).toHaveAttribute('data-verdict', 'closed')
    expect(b.className).toContain('mx-0')
    // …merged, not replaced: the tone classes are still on.
    expect(b.className).toContain('rounded-lg')
  })
})
