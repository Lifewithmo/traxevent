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
const ensureIcsToken = vi.hoisted(() => vi.fn())

vi.mock('@/lib/calendar-fetch', () => ({ orgIdBySlug, orgCalendarFeed, orgEvents }))
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
})
