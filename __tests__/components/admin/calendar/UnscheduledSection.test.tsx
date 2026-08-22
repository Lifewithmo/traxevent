import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { UnscheduledSection } from '@/components/admin/calendar/UnscheduledSection'
import type { UnscheduledRow } from '@/lib/calendar-unscheduled'

/**
 * The work that has NO date. `buildCalendarFeed` drops it, so before this
 * section the only way to see "the ones I haven't booked yet" was to leave the
 * calendar entirely.
 */

const TODAY = '2026-08-18'

const row = (over: Partial<UnscheduledRow>): UnscheduledRow => ({
  id: 'l1',
  title: 'Nampa block party',
  kind: 'lead',
  href: '/acme/leads/l1',
  createdAt: '2026-08-01T00:00:00.000Z',
  committed: false,
  ...over,
})

/** buildUnscheduled's own order: deadline, then money, then age. The section
 *  must render this array as-given. */
const RANKED: UnscheduledRow[] = [
  row({ id: 'a', title: 'Past-due catering', bookByDate: '2026-08-12', value: 200 }),
  row({ id: 'b', title: 'Boise brewery pop-up', bookByDate: '2026-08-22', value: 9000 }),
  row({ id: 'c', title: 'Meridian wedding', value: 7000 }),
  row({ id: 'd', title: 'Star office party', value: 1200 }),
  row({ id: 'e', title: 'Kuna market day', value: 400 }),
  row({ id: 'f', title: 'Eagle school fair' }),
]

function rowEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="unscheduled-row"]'))
}

function disclosure(): HTMLElement {
  return screen.getByRole('button', { name: /unscheduled/i })
}

describe('UnscheduledSection', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the rows in the order buildUnscheduled returned them', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED.slice(0, 4)} today={TODAY} />)
    expect(rowEls().map((el) => el.getAttribute('data-unscheduled-id'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does NOT re-sort — a list handed over in a non-obvious order stays in it', () => {
    // Value descending would be b, c, d, a; deadline-first is the real ranking
    // and the section must not have an opinion about it.
    render(<UnscheduledSection orgSlug="acme" rows={RANKED.slice(0, 4)} today={TODAY} />)
    const titles = rowEls().map((el) => el.textContent)
    expect(titles[0]).toContain('Past-due catering')
    expect(titles[1]).toContain('Boise brewery pop-up')
  })

  it('gives every row its title, its reason and a link to the record', () => {
    render(<UnscheduledSection orgSlug="acme" rows={[RANKED[0]]} today={TODAY} />)
    const link = rowEls()[0]
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/acme/leads/l1')
    expect(within(link).getByText('Past-due catering')).toBeInTheDocument()
    expect(within(link).getByText('Book by Aug 12 · 6d past due')).toBeInTheDocument()
  })

  it('explains a row with no deadline by its value instead', () => {
    render(<UnscheduledSection orgSlug="acme" rows={[RANKED[2]]} today={TODAY} />)
    expect(screen.getByText('$7,000 · no date promised')).toBeInTheDocument()
  })

  it('counts the work in the header', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    expect(within(disclosure()).getByText('6')).toBeInTheDocument()
  })

  // ── the cap ────────────────────────────────────────────────────────────────
  it('caps the visible rows and offers a truthful "+N more" that goes somewhere real', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    expect(rowEls()).toHaveLength(4)
    const more = screen.getByRole('link', { name: /\+2 more with no date/i })
    expect(more).toHaveAttribute('href', '/acme/leads')
    // the count in the link is the real remainder, not a constant
    expect(more).toHaveTextContent('+2 more')
  })

  it('shows no overflow link when nothing is hidden', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED.slice(0, 4)} today={TODAY} />)
    expect(rowEls()).toHaveLength(4)
    expect(screen.queryByText(/more with no date/i)).not.toBeInTheDocument()
  })

  // ── empty ──────────────────────────────────────────────────────────────────
  it('says everything is scheduled, and offers no manufactured next step', () => {
    render(<UnscheduledSection orgSlug="acme" rows={[]} today={TODAY} />)
    expect(screen.getByText('Everything is scheduled.')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: /unscheduled work/i })
    // the disclosure is the only control; no CTA link was invented to fill it
    expect(within(section).queryAllByRole('link')).toHaveLength(0)
    expect(within(section).getAllByRole('button')).toHaveLength(1)
  })

  it('does not badge a zero — an empty queue has no count to shout', () => {
    render(<UnscheduledSection orgSlug="acme" rows={[]} today={TODAY} />)
    expect(within(disclosure()).queryByText('0')).not.toBeInTheDocument()
  })

  // ── disclosure a11y ────────────────────────────────────────────────────────
  it('is a native button disclosure wired to the region it controls', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    const btn = disclosure()
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('type', 'button')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const controlled = btn.getAttribute('aria-controls')
    expect(controlled).toBeTruthy()
    // aria-controls must resolve — a dangling reference tells assistive tech
    // nothing and fails axe's aria-valid-attr-value.
    expect(document.getElementById(controlled as string)).toBeTruthy()
  })

  it('collapses and re-expands, keeping the count visible while collapsed', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    fireEvent.click(disclosure())
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(rowEls()).toHaveLength(0)
    // …the whole point of collapsing it is that you still know it is there.
    expect(within(disclosure()).getByText('6')).toBeInTheDocument()
    fireEvent.click(disclosure())
    expect(rowEls()).toHaveLength(4)
  })

  it('UNMOUNTS the collapsed rows rather than hiding them', () => {
    // The rail's mobile focus trap walks `querySelectorAll('a[href]')` over the
    // whole panel. A `hidden` subtree keeps its anchors in that list, and the
    // trap would then try to focus a display:none element and drop focus.
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    fireEvent.click(disclosure())
    const section = screen.getByRole('region', { name: /unscheduled work/i })
    expect(section.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('meets the 24px minimum target on every control, and reaches for 44', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    for (const el of [disclosure(), ...rowEls(), screen.getByRole('link', { name: /\+2 more/i })]) {
      expect(el.className).toMatch(/min-h-11/)
    }
  })

  // ── persistence ────────────────────────────────────────────────────────────
  it('defaults to OPEN — undated work is the thing you are meant to see', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(rowEls().length).toBeGreaterThan(0)
  })

  it('remembers an explicit collapse across mounts', () => {
    const { unmount } = render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    fireEvent.click(disclosure())
    expect(window.localStorage.getItem('tx-calendar-unscheduled-open')).toBe('0')
    unmount()

    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('remembers an explicit re-open too', () => {
    window.localStorage.setItem('tx-calendar-unscheduled-open', '0')
    const { unmount } = render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    fireEvent.click(disclosure())
    expect(window.localStorage.getItem('tx-calendar-unscheduled-open')).toBe('1')
    unmount()

    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
  })

  // ── the sold-but-undated row ───────────────────────────────────────────────
  describe('a won-but-undated row', () => {
    const far = { bookByDate: '2026-12-01', value: 5000 }
    const sold = row({ id: 'sold', title: 'Alder wedding', kind: 'event', href: '/acme/alder/dashboard', committed: true, ...far })
    const open = row({ id: 'open', title: 'Hillside picnic', ...far })

    it('reads as more urgent than an open opportunity with the identical deadline', () => {
      render(<UnscheduledSection orgSlug="acme" rows={[sold, open]} today={TODAY} />)
      const [soldEl, openEl] = rowEls()
      expect(soldEl).toHaveAttribute('data-committed', 'true')
      expect(soldEl).toHaveAttribute('data-urgency', 'now')
      expect(openEl).toHaveAttribute('data-committed', 'false')
      expect(openEl).toHaveAttribute('data-urgency', 'later')
    })

    it('says SOLD in words — the urgency is never carried by colour alone', () => {
      render(<UnscheduledSection orgSlug="acme" rows={[sold, open]} today={TODAY} />)
      const [soldEl, openEl] = rowEls()
      expect(within(soldEl).getByText('Sold')).toBeInTheDocument()
      expect(within(openEl).queryByText('Sold')).not.toBeInTheDocument()
      // and both still state their deadline, so the tier did not eat the detail
      expect(soldEl).toHaveTextContent('Book by Dec 1')
      expect(openEl).toHaveTextContent('Book by Dec 1')
    })

    it('does not jump the queue — presentation escalates, ranking does not', () => {
      render(<UnscheduledSection orgSlug="acme" rows={[open, sold]} today={TODAY} />)
      expect(rowEls().map((el) => el.getAttribute('data-unscheduled-id'))).toEqual(['open', 'sold'])
    })
  })

  // ── the drag-source contract (a concurrent increment consumes these) ───────
  it('exposes a stable, simple hook on every row for drag-to-schedule', () => {
    const evt = row({ id: 'e1', kind: 'event', leadId: 'L7', href: '/acme/alder/dashboard', committed: true })
    render(<UnscheduledSection orgSlug="acme" rows={[evt]} today={TODAY} />)
    const el = rowEls()[0]
    expect(el).toHaveAttribute('data-slot', 'unscheduled-row')
    expect(el).toHaveAttribute('data-unscheduled-id', 'e1')
    expect(el).toHaveAttribute('data-unscheduled-kind', 'event')
    // the opportunity is what actually owns `event_date`
    expect(el).toHaveAttribute('data-lead-id', 'L7')
    // …and dragging is NOT this lane's job
    expect(el).not.toHaveAttribute('draggable')
  })

  it('uses tokens, never a raw hex, for the urgency tones', () => {
    render(<UnscheduledSection orgSlug="acme" rows={RANKED} today={TODAY} />)
    const section = screen.getByRole('region', { name: /unscheduled work/i })
    expect(section.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(section.innerHTML).toMatch(/var\(--danger-fg\)/)
  })
})
