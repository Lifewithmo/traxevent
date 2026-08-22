import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-26&kinds=pipeline')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-12&kinds=pipeline')
  })

  it('in Day view with a day open, arrows step the DAY route and omit stale week', () => {
    // Repro of the desync bug: stepping the week param here left DayView pinned to
    // the old selectedDay while the window bound to the new day → blank grid.
    render(<CalendarCanvas {...base} view="day" selectedDay="2026-08-20" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-21?view=day&kinds=pipeline')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-19?view=day&kinds=pipeline')
  })

  it('in Day view with a day open, Today jumps to today’s day route', () => {
    render(<CalendarCanvas {...base} view="day" selectedDay="2026-08-20" />)
    fireEvent.keyDown(window, { key: 't' })
    expect(push).toHaveBeenCalledWith('/acme/calendar/2026-08-18?view=day&kinds=pipeline')
  })

  it('week-view arrows still step the week (day-stepping only when a day is open)', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/acme/calendar?view=week&week=2026-08-26&kinds=pipeline')
  })

  it('switches views with single-key shortcuts', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'm' })
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
})
