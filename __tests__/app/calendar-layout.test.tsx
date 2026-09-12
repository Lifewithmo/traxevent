import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement } from 'react'

/**
 * Cold entry to /calendar.
 *
 * `loading.tsx` wraps a layout's CHILDREN, never the layout itself, so the
 * cockpit's loading boundary could do nothing about the LAYOUT's own reads: the
 * org lookup, the calendar feed, the events collection and the ICS token were
 * all awaited at the top of the layout body, on a `force-dynamic` route where
 * none of it is cached. Until every one of them came back the browser had
 * nothing — not the rail, not the canvas skeleton, nothing.
 *
 * The fix is scoped to the calendar on purpose (an `app/(admin)/[orgSlug]/
 * loading.tsx` would silently change every other module): the layout awaits
 * nothing, hands the promise down, and suspends only the rail.
 */

const orgIdBySlug = vi.hoisted(() => vi.fn())
const orgCalendarFeed = vi.hoisted(() => vi.fn())
const orgEvents = vi.hoisted(() => vi.fn())
// The runway gained real invoice state, so the layout fetches invoices in the SAME
// Promise.all. An unmocked spy is `undefined` and throws as the array literal is
// evaluated left-to-right — before ensureIcsToken is ever reached.
const orgInvoices = vi.hoisted(() => vi.fn())
// The rail also surfaces the work with NO date — buildCalendarFeed's complement.
// Same rule as orgInvoices: it rides in the SAME Promise.all, so an unmocked spy
// is `undefined` and throws while the array literal is being evaluated.
const orgUnscheduled = vi.hoisted(() => vi.fn())
// …and the Bookability Verdict's context rides in the SAME Promise.all, under
// exactly the same rule: an unmocked spy is `undefined` and throws while the
// array literal is being evaluated, before ensureIcsToken is ever reached.
const orgBookabilityCtx = vi.hoisted(() => vi.fn())
const ensureIcsToken = vi.hoisted(() => vi.fn())

vi.mock('@/lib/calendar-fetch', () => ({
  orgIdBySlug,
  orgCalendarFeed,
  orgEvents,
  orgInvoices,
  orgUnscheduled,
  orgBookabilityCtx,
}))
vi.mock('@/actions/calendar-sync', () => ({ ensureIcsToken }))

import CalendarLayout from '@/app/(admin)/[orgSlug]/calendar/layout'

/** A read that never comes back — the worst case a cold entry has to survive. */
const hang = <T,>() => new Promise<T>(() => {})

describe('calendar layout cold entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgIdBySlug.mockReturnValue(hang<string>())
    orgCalendarFeed.mockReturnValue(hang<unknown[]>())
    orgEvents.mockReturnValue(hang<unknown[]>())
    orgInvoices.mockReturnValue(hang<unknown[]>())
    orgUnscheduled.mockReturnValue(hang<unknown[]>())
    orgBookabilityCtx.mockReturnValue(hang<unknown>())
    ensureIcsToken.mockReturnValue(hang<string>())
  })

  it('is not an async layout — it returns an element without awaiting a single read', () => {
    const tree = CalendarLayout({
      children: <div data-testid="canvas-slot" />,
      params: Promise.resolve({ orgSlug: 'acme' }),
    })
    // An `async` layout would hand back a pending promise here, and the whole
    // cockpit shell would wait on Firestore before it existed.
    expect(isValidElement(tree)).toBe(true)
    expect((tree as unknown as { then?: unknown }).then).toBeUndefined()
  })

  it('paints the shell — children plus a rail placeholder — while the reads hang', () => {
    render(
      CalendarLayout({
        children: <div data-testid="canvas-slot" />,
        params: Promise.resolve({ orgSlug: 'acme' }),
      })
    )
    // The children slot is OUTSIDE the rail's boundary, so `loading.tsx` (or the
    // real page) can take it from here.
    expect(screen.getByTestId('canvas-slot')).toBeInTheDocument()
    // …and the rail's own slot is held by a shaped placeholder, not left blank.
    expect(document.querySelector('[data-slot="rail-skeleton"]')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10)
  })

  it('still starts the rail reads immediately rather than deferring them', async () => {
    orgIdBySlug.mockResolvedValue('org1')
    render(
      CalendarLayout({
        children: <div data-testid="canvas-slot" />,
        params: Promise.resolve({ orgSlug: 'acme' }),
      })
    )
    // Passing the promise down must not turn into fetching later: the work is
    // kicked off in the layout body, it is only the AWAIT that moved.
    await vi.waitFor(() => expect(orgCalendarFeed).toHaveBeenCalledWith('org1', 'acme'))
    expect(orgEvents).toHaveBeenCalledWith('org1')
    expect(ensureIcsToken).toHaveBeenCalledWith('org1')
  })

  // The undated work the rail surfaces has to be fetched on the SAME cold-entry
  // path as everything else — starting it after the Promise.all resolves would
  // add a second serial round trip to a `force-dynamic` route, which is exactly
  // the block this whole file exists to prevent.
  it('starts the unscheduled read in the same non-blocking batch', async () => {
    orgIdBySlug.mockResolvedValue('org1')
    render(
      CalendarLayout({
        children: <div data-testid="canvas-slot" />,
        params: Promise.resolve({ orgSlug: 'acme' }),
      })
    )
    await vi.waitFor(() => expect(orgUnscheduled).toHaveBeenCalledWith('org1', 'acme'))
    // …and it did NOT wait for its siblings: all four are in flight together
    // while every one of them is still hanging.
    expect(orgCalendarFeed).toHaveBeenCalled()
    expect(orgInvoices).toHaveBeenCalled()
  })

  // Same rule for the Bookability Verdict's context: it is the rail's "next open
  // Saturday" line and it must be in flight WITH the rest, not chained after it.
  it('starts the bookability read in the same non-blocking batch', async () => {
    orgIdBySlug.mockResolvedValue('org1')
    render(
      CalendarLayout({
        children: <div data-testid="canvas-slot" />,
        params: Promise.resolve({ orgSlug: 'acme' }),
      })
    )
    await vi.waitFor(() => expect(orgBookabilityCtx).toHaveBeenCalled())
    // It is handed `today` explicitly rather than reading the clock inside the
    // memoised body, so the layout and the day route share one cache entry.
    const [orgId, slug, today] = orgBookabilityCtx.mock.calls[0]
    expect([orgId, slug]).toEqual(['org1', 'acme'])
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(orgCalendarFeed).toHaveBeenCalled()
    expect(orgUnscheduled).toHaveBeenCalled()
  })
})
