import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { CalendarItem } from '@/lib/calendar'

const push = vi.fn()
const search = new URLSearchParams('view=week&kinds=pipeline')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/acme/calendar',
}))

// AgendaView (rendered by the canvas in agenda view) imports its bulk-reschedule
// server action; without this the real module pulls in firebase-admin.
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
}))

import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'

const items: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: '2026-08-19', kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '20:00' },
  { id: 'i1', title: 'Deposit', date: '2026-08-20', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
]

const base = {
  orgSlug: 'acme',
  items,
  today: '2026-08-18',
  anchor: '2026-08-19',
  kinds: 'pipeline',
}

/** The element the single-character shortcuts are bound to (WCAG 2.1.4's focus
 *  exception). Firing on `window` deliberately does NOT reach it. */
function cockpit(): HTMLElement {
  const el = document.querySelector('[data-slot="calendar-cockpit"]')
  if (!el) throw new Error('cockpit element not found')
  return el as HTMLElement
}

describe('CalendarCanvas', () => {
  beforeEach(() => push.mockClear())

  it('renders the active view', () => {
    render(<CalendarCanvas {...base} view="week" />)
    expect(screen.getByRole('region', { name: /week grid/i })).toBeInTheDocument()
  })

  it('switches which view renders with the view prop', () => {
    const { rerender } = render(<CalendarCanvas {...base} view="month" />)
    expect(screen.getByRole('region', { name: /month view/i })).toBeInTheDocument()
    rerender(<CalendarCanvas {...base} view="agenda" />)
    expect(screen.getByRole('region', { name: /agenda/i })).toBeInTheDocument()
  })

  it('offers Month/Week/Day/Agenda tabs that preserve ?kinds', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const tabs = screen.getByRole('navigation', { name: /calendar view/i })
    expect(within(tabs).getByRole('link', { name: 'Month' })).toHaveAttribute(
      'href',
      '/acme/calendar?view=month&week=2026-08-19&kinds=pipeline'
    )
    expect(within(tabs).getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'page')
  })

  it('moves the anchor forward/back with the arrow keys, preserving view + kinds', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(cockpit(), { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-26&kinds=pipeline')
    fireEvent.keyDown(cockpit(), { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-12&kinds=pipeline')
  })

  it('in Day view with a day open, arrows step the DAY route and omit stale week', () => {
    // Repro of the desync bug: stepping the week param here left DayView pinned to
    // the old selectedDay while the window bound to the new day → blank grid.
    render(<CalendarCanvas {...base} view="day" selectedDay="2026-08-20" />)
    fireEvent.keyDown(cockpit(), { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-21?view=day&kinds=pipeline')
    fireEvent.keyDown(cockpit(), { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-19?view=day&kinds=pipeline')
  })

  it('in Day view with a day open, Today jumps to today’s day route', () => {
    render(<CalendarCanvas {...base} view="day" selectedDay="2026-08-20" />)
    fireEvent.keyDown(cockpit(), { key: 't' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-18?view=day&kinds=pipeline')
  })

  it('week-view arrows still step the week (day-stepping only when a day is open)', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(cockpit(), { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-26&kinds=pipeline')
  })

  it('switches views with single-key shortcuts', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(cockpit(), { key: 'm' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=month&week=2026-08-19&kinds=pipeline')
  })

  it('ignores single-key shortcuts while typing in a field', () => {
    render(
      <div>
        <input aria-label="stray" />
        <CalendarCanvas {...base} view="week" />
      </div>
    )
    const input = screen.getByLabelText('stray')
    input.focus()
    fireEvent.keyDown(input, { key: 'm' })
    expect(push).not.toHaveBeenCalled()
  })

  it('opens the command palette with ⌘K and offers a jump-to-date', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('combobox')
    fireEvent.change(box, { target: { value: '2026-08-25' } })
    expect(within(dialog).getByText(/jump to/i)).toBeInTheDocument()
    // Miller: never more than ~7 results at once.
    expect(within(dialog).getAllByRole('option').length).toBeLessThanOrEqual(7)
  })

  it('routes the palette jump through the day-link helper, omitting stale week', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('combobox')
    fireEvent.change(box, { target: { value: '2026-08-25' } })
    fireEvent.click(within(dialog).getByText(/jump to/i))
    // targets the clicked day with view+kinds preserved, but NO week (the target
    // derives its own period — anchor=2026-08-19 must not leak through).
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-25?view=week&kinds=pipeline')
  })

  it('wires the active command to the combobox via aria-activedescendant', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('combobox')
    const ids = within(dialog).getAllByRole('option').map((o) => o.id)
    expect(ids[0]).toBeTruthy()
    expect(box).toHaveAttribute('aria-activedescendant', ids[0])
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box).toHaveAttribute('aria-activedescendant', ids[1])
  })

  it('keeps the pane-swap out of prefers-reduced-motion', () => {
    const { container } = render(<CalendarCanvas {...base} view="week" />)
    const pane = container.querySelector('[data-slot="canvas-pane"]')
    expect(pane?.className).toMatch(/motion-reduce:/)
  })

  // ── WCAG 2.1.4 Character Key Shortcuts (Level A) ──────────────────────────
  // These were bound on `window`, unscoped, with no off switch and no remap.
  // `d` and `t` are NVDA/JAWS single-letter quick-nav keys, so a screen-reader
  // user trying to move by landmark or table was fired through a route change
  // instead. The conformant escape is the focus exception: active only while
  // the component itself has focus.
  it('does NOT fire the single-key shortcuts from outside the cockpit', () => {
    render(
      <div>
        <button type="button">outside</button>
        <CalendarCanvas {...base} view="week" />
      </div>
    )
    const outside = screen.getByRole('button', { name: 'outside' })
    outside.focus()
    for (const key of ['m', 'w', 'd', 'a', 't', 'ArrowLeft', 'ArrowRight']) {
      fireEvent.keyDown(outside, { key })
      fireEvent.keyDown(window, { key })
      fireEvent.keyDown(document.body, { key })
    }
    expect(push).not.toHaveBeenCalled()
    // …and the very same keys still work once focus is inside the cockpit.
    fireEvent.keyDown(cockpit(), { key: 'd' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=day&week=2026-08-19&kinds=pipeline')
  })

  it('ignores keyboard auto-repeat so a held arrow cannot machine-gun router.push', () => {
    render(<CalendarCanvas {...base} view="week" />)
    // The first keydown of a hold, then the auto-repeat ticks (~30/s against a
    // force-dynamic route, one Firestore round-trip each).
    fireEvent.keyDown(cockpit(), { key: 'ArrowRight' })
    for (let i = 0; i < 20; i++) fireEvent.keyDown(cockpit(), { key: 'ArrowRight', repeat: true })
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('publishes the bindings in a ? shortcuts sheet, reachable by key and by pointer', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    // The bindings used to exist only in a source comment.
    fireEvent.keyDown(cockpit(), { key: '?' })
    const sheet = await screen.findByRole('dialog', { name: /keyboard shortcuts/i })
    for (const cap of ['M', 'W', 'D', 'A', 'T', '←', '→', '?']) {
      expect(within(sheet).getAllByText(cap).length).toBeGreaterThan(0)
    }
    // Every cap is a real <kbd>, not styled prose.
    expect(sheet.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(8)
  })

  it('offers a visible ? affordance in the toolbar for pointer users', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i })
    expect(trigger.querySelector('kbd')?.textContent).toBe('?')
    fireEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument()
  })

  it('annotates the stepper controls with aria-keyshortcuts', () => {
    render(<CalendarCanvas {...base} view="week" />)
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft')
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('aria-keyshortcuts', 'ArrowRight')
  })
})

/**
 * ── The ⌘K palette after W3-K ────────────────────────────────────────────────
 *
 * The audit's charge was "accelerators that accelerate nothing": the palette
 * was handed the whole feed and filtered only its own six hardcoded labels, and
 * the date jump demanded a literal YYYY-MM-DD. These tests pin both fixes and
 * the accessibility contract around them.
 */
describe('CalendarCanvas — the command palette searches the feed', () => {
  beforeEach(() => push.mockClear())

  const feed: CalendarItem[] = [
    { id: 'e1', title: 'Henderson wedding', date: '2026-08-19', kind: 'event', href: '/acme/events/e1', detail: 'Riverbend Barn · 120 guests' },
    { id: 'e2', title: 'Corporate mixer', date: '2026-08-21', kind: 'event', href: '/acme/events/e2', detail: 'Northgate Tech' },
    { id: 'l1', title: 'Henderson rehearsal hold', date: '2026-08-18', kind: 'lead', href: '/acme/leads/l1', tentative: true },
    { id: 'i1', title: 'Deposit', date: '2026-08-20', kind: 'invoice_due', href: '/acme/invoices/i1', amount: 500, detail: 'Henderson' },
    { id: 't1', title: 'Order kegs', date: '2026-08-25', kind: 'task', href: '/acme/tasks/t1' },
  ]

  const searchBase = { ...base, items: feed }

  async function openPalette(props: Partial<typeof searchBase> = {}) {
    render(<CalendarCanvas {...searchBase} {...props} view="week" />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    return { dialog, box: within(dialog).getByRole('combobox') as HTMLInputElement }
  }

  const optionNames = (dialog: HTMLElement) =>
    within(dialog).getAllByRole('option').map((o) => o.textContent ?? '')

  // ── Defect 1: it held the entire feed and searched none of it ─────────────

  it('surfaces a feed item by customer name — the row it was already holding', async () => {
    const { dialog } = await openPalette()
    const box = within(dialog).getByRole('combobox')
    fireEvent.change(box, { target: { value: 'Henderson' } })
    const names = optionNames(dialog)
    expect(names.some((n) => n.includes('Henderson wedding'))).toBe(true)
    expect(names.some((n) => n.includes('Henderson rehearsal hold'))).toBe(true)
    // ...and NOT the unrelated ones.
    expect(names.some((n) => n.includes('Corporate mixer'))).toBe(false)
  })

  it('navigates a feed result to the item’s own href', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Henderson wedding' } })
    fireEvent.click(within(dialog).getByText('Henderson wedding'))
    expect(push).toHaveBeenCalledWith('/acme/events/e1')
  })

  it('matches on the item’s detail line too, not only its title', async () => {
    const { dialog } = await openPalette()
    // "Riverbend" appears only in the detail of the wedding.
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Riverbend' } })
    const names = optionNames(dialog)
    expect(names.some((n) => n.includes('Henderson wedding'))).toBe(true)
    expect(names.length).toBe(1)
  })

  it('ANDs the terms, so a two-word query narrows instead of widening', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'henderson deposit' } })
    const names = optionNames(dialog)
    // Only the invoice carries both "Deposit" (title) and "Henderson" (detail).
    expect(names.length).toBe(1)
    expect(names[0]).toContain('Deposit')
  })

  it('falls back to the item’s day when the feed row carries no href', async () => {
    const orphan: CalendarItem[] = [
      { id: 'x1', title: 'Orphan signal', date: '2026-08-27', kind: 'compliance', href: '' },
    ]
    const { dialog } = await openPalette({ items: orphan })
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Orphan' } })
    fireEvent.click(within(dialog).getByText('Orphan signal'))
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-27?view=week&kinds=pipeline')
  })

  it('groups the results — dates, then the calendar, then the commands', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '2026-08-19' } })
    const groups = within(dialog).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toEqual([
      'cmdk-h-jump',
      'cmdk-h-calendar',
    ])
    // Every group is NAMED, so a screen reader gets sections, not a flat soup.
    expect(within(groups[0]).getByText('Dates')).toBeInTheDocument()
    expect(within(groups[1]).getByText('On the calendar')).toBeInTheDocument()
  })

  it('still shows the fixed commands with an empty query', async () => {
    const { dialog } = await openPalette()
    const names = optionNames(dialog)
    expect(names).toEqual(['Go to today', 'Book a job', 'Month view', 'Week view', 'Day view', 'Agenda view'])
  })

  // ── The cap, and the fact that it is stated rather than silent ────────────

  it('caps the rendered feed results and says how many it is hiding', async () => {
    const many: CalendarItem[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      title: `Henderson job ${i}`,
      date: '2026-08-19',
      kind: 'event' as const,
      href: `/acme/events/m${i}`,
    }))
    const { dialog } = await openPalette({ items: many })
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Henderson' } })
    const names = optionNames(dialog)
    expect(names.length).toBe(8)
    // A silent cap is a lie; the true total is on screen.
    expect(within(dialog).getByText(/showing 8 of 40 calendar matches/i)).toBeInTheDocument()
  })

  it('says nothing about a cap when everything fits', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Henderson' } })
    expect(within(dialog).queryByText(/showing \d+ of/i)).toBeNull()
  })

  it('builds the search index ONCE per feed, not once per keystroke', async () => {
    // Doherty, made observable instead of timed: the per-item string work
    // (concat + toLowerCase) has to be hoisted out of the query memo, or every
    // keystroke re-walks the whole feed. A counting getter on `title` reports
    // exactly how many items the component touched.
    let titleReads = 0
    const counted: CalendarItem[] = Array.from({ length: 400 }, (_, i) => {
      const row = {
        id: `c${i}`,
        // Far outside the rendered week, so the grid never reads these titles.
        date: '2029-01-0' + (1 + (i % 9)),
        kind: 'event' as const,
        href: `/acme/events/c${i}`,
      } as CalendarItem
      Object.defineProperty(row, 'title', {
        enumerable: true,
        get() {
          titleReads++
          return `Henderson job ${i}`
        },
      })
      return row
    })

    const { dialog } = await openPalette({ items: counted })
    // The index really was built (400 items walked at least once).
    expect(titleReads).toBeGreaterThanOrEqual(400)

    const afterIndex = titleReads
    const box = within(dialog).getByRole('combobox')
    for (const q of ['h', 'he', 'hen', 'hend', 'hende', 'hender', 'henders', 'henderson']) {
      fireEvent.change(box, { target: { value: q } })
    }
    // Eight keystrokes may touch only the rows they RENDER (8 apiece), never
    // the 3,200 reads a per-keystroke rebuild would cost.
    expect(titleReads - afterIndex).toBeLessThan(200)
    expect(within(dialog).getAllByRole('option').length).toBe(8)
    expect(within(dialog).getByText(/showing 8 of 400 calendar matches/i)).toBeInTheDocument()
  })

  // ── Defect 2: date jumping demanded an exact ISO string ───────────────────

  it('offers a confirmable jump for "sep 13" — the parse is spelled out first', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'sep 13' } })
    // Not "Jump to 2026-09-13": the weekday and the RESOLVED YEAR are the two
    // things the operator has to be able to check before committing.
    expect(within(dialog).getByText('Jump to Sunday, 13 September 2026')).toBeInTheDocument()
  })

  it.each([
    ['sep 13', '2026-09-13'],
    ['9/13', '2026-09-13'],
    ['13 sep', '2026-09-13'],
    ['2026-09-13', '2026-09-13'],
    ['tomorrow', '2026-08-19'],
    ['next sat', '2026-08-22'],
    ['+2w', '2026-09-01'],
    ['-3d', '2026-08-15'],
  ])('jumps for %s → %s', async (typed, expected) => {
    // today = 2026-08-18, a Tuesday.
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: typed } })
    fireEvent.click(within(dialog).getByText(/^Jump to /))
    expect(push).toHaveBeenCalledWith(`/acme/calendar/${expected}?view=week&kinds=pipeline`)
  })

  it('commits the jump on Enter, not just on click', async () => {
    const { box } = await openPalette()
    fireEvent.change(box, { target: { value: 'sep 13' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-09-13?view=week&kinds=pipeline')
  })

  it('answers "am I free?" in the jump preview when the feed covers that day', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '8/19' } })
    // 2026-08-19 carries one item in the fixture, and the day is inside the
    // loaded window — so the palette can say so before the operator lands.
    expect(within(dialog).getByText(/tomorrow · 1 item scheduled/i)).toBeInTheDocument()
  })

  it('reports an empty covered day honestly rather than staying silent', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '8/22' } })
    expect(within(dialog).getByText(/nothing scheduled/i)).toBeInTheDocument()
  })

  it('does NOT claim a day is empty when that day is outside the loaded feed', async () => {
    // The canvas gets a WINDOW, not the whole book. A confident "nothing
    // scheduled" for a day we never read is worse than saying less.
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '2027-03-04' } })
    expect(within(dialog).getByText(/^Jump to Thursday, 4 March 2027$/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/scheduled/i)).toBeNull()
  })

  it('does not offer a jump for a query that is not a date', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'Henderson' } })
    expect(within(dialog).queryByText(/^Jump to /)).toBeNull()
  })

  it('shows a date jump and that day’s work side by side', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '2026-08-19' } })
    const names = optionNames(dialog)
    expect(names[0]).toContain('Jump to Wednesday, 19 August 2026')
    expect(names.some((n) => n.includes('Henderson wedding'))).toBe(true)
  })

  // ── Empty state ───────────────────────────────────────────────────────────

  it('turns "No matches" into instructions instead of a void', async () => {
    const { dialog } = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'zzzzqqq' } })
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0)
    const status = dialog.querySelector('[data-slot="cmdk-status"]')
    expect(status?.textContent).toMatch(/no matches for “zzzzqqq”/i)
    expect(status?.textContent).toMatch(/sep 13/)
    expect(status?.textContent).toMatch(/next sat/)
  })

  it('does nothing on Enter when there is nothing to run', async () => {
    const { box } = await openPalette()
    fireEvent.change(box, { target: { value: 'zzzzqqq' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
  })

  // ── Keyboard + a11y ───────────────────────────────────────────────────────

  it('moves focus into the palette on open and restores it on Escape', async () => {
    render(
      <div>
        <button type="button">before</button>
        <CalendarCanvas {...searchBase} view="week" />
      </div>
    )
    const before = screen.getByRole('button', { name: 'before' })
    before.focus()
    expect(document.activeElement).toBe(before)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('combobox')
    expect(document.activeElement).toBe(box)

    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    // …and the keyboard user is put back where they were, not dumped on <body>.
    await waitFor(() => expect(document.activeElement).toBe(before))
  })

  it('wraps the arrow keys around the ends of the list', async () => {
    const { dialog, box } = await openPalette()
    const ids = within(dialog).getAllByRole('option').map((o) => o.id)
    expect(box).toHaveAttribute('aria-activedescendant', ids[0])
    // Up from the first lands on the last — the ring, not a wall.
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    expect(box).toHaveAttribute('aria-activedescendant', ids[ids.length - 1])
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box).toHaveAttribute('aria-activedescendant', ids[0])
  })

  it('binds Home and End to the ends of the list', async () => {
    const { dialog, box } = await openPalette()
    const ids = within(dialog).getAllByRole('option').map((o) => o.id)
    fireEvent.keyDown(box, { key: 'End' })
    expect(box).toHaveAttribute('aria-activedescendant', ids[ids.length - 1])
    fireEvent.keyDown(box, { key: 'Home' })
    expect(box).toHaveAttribute('aria-activedescendant', ids[0])
  })

  it('re-homes the highlight to the top result when the query changes', async () => {
    const { dialog, box } = await openPalette()
    // Move OFF the first row, then retype. The replacement list must still be
    // long enough to hold the stale index — otherwise the read-time clamp hides
    // the bug and the test proves nothing.
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.change(box, { target: { value: 'Henderson' } })
    const options = within(dialog).getAllByRole('option')
    expect(options.length).toBeGreaterThan(2)
    expect(box).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    // A stale index would leave Enter firing whatever happened to land in that
    // slot in the NEW list.
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/acme/events/e1')
  })

  it('announces the result count in a live region', async () => {
    const { dialog, box } = await openPalette()
    const live = dialog.querySelector('[role="status"][aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live!.textContent).toMatch(/^6 results$/)
    fireEvent.change(box, { target: { value: 'Riverbend' } })
    expect(live!.textContent).toMatch(/^1 result$/)
    fireEvent.change(box, { target: { value: 'zzzzqqq' } })
    expect(live!.textContent).toBe('No matches')
  })

  it('gives every result row a 44px target', async () => {
    const { dialog } = await openPalette()
    for (const opt of within(dialog).getAllByRole('option')) {
      // WCAG 2.5.8 asks 24px; a tablet in a van gets 44.
      expect(opt.className).toMatch(/min-h-11/)
    }
  })

  it('keeps the visible button label inside its accessible name (WCAG 2.5.3)', () => {
    render(<CalendarCanvas {...searchBase} view="week" />)
    const trigger = screen.getByRole('button', { name: /^search, jobs, customers and dates$/i })
    expect(trigger.textContent).toContain('Search')
  })

  it('publishes the palette bindings in the ? sheet', async () => {
    render(<CalendarCanvas {...searchBase} view="week" />)
    fireEvent.keyDown(cockpit(), { key: '?' })
    const sheet = await screen.findByRole('dialog', { name: /keyboard shortcuts/i })
    // A binding that is not in the sheet is undiscoverable.
    for (const cap of ['↑', '↓', 'Home', 'End', '↵', 'Esc']) {
      expect(within(sheet).getAllByText(cap).length, cap).toBeGreaterThan(0)
    }
    expect(within(sheet).getByText(/search jobs, customers & dates/i)).toBeInTheDocument()
  })
})
