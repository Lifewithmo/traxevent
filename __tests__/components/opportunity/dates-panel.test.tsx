import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatesPanel } from '@/components/admin/opportunity/DatesPanel'
import type { CalendarItem } from '@/lib/calendar'
import type { Lead } from '@/lib/types'

const listCalendarRange = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@/actions/calendar', () => ({ listCalendarRange }))

const lead = { id: 'l1', name: 'Dana', stage: 'consultation', event_date: '2026-09-04', created_at: '2026-07-01T00:00:00.000Z' } as Lead
const items: CalendarItem[] = [
  { id: 'e1', title: 'Mission Co-op', date: '2026-09-02', kind: 'event', href: '/demo/gala/dashboard' },
  { id: 'l9', title: 'Farmers market stall', date: '2026-09-05', kind: 'lead', href: '/demo/leads/l9' },
  { id: 't1', title: 'Call venue', date: '2026-09-03', kind: 'task', href: '/demo/leads/l1' },
]

function renderPanel(overrides?: { lead?: Lead; initialItems?: CalendarItem[] }) {
  return render(
    <DatesPanel
      orgId="o1"
      orgSlug="demo"
      lead={overrides?.lead ?? lead}
      today="2026-08-07"
      initialItems={overrides?.initialItems ?? items}
    />
  )
}

describe('DatesPanel', () => {
  it('renders the event-centred window and list', () => {
    renderPanel()
    expect(screen.getByText('Dates')).toBeInTheDocument()
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    expect(screen.getByText(/Mission Co-op/)).toBeInTheDocument()      // event line
    expect(screen.getByText(/Farmers market stall/)).toBeInTheDocument() // tentative line
    expect(screen.getByTestId('window-task-count')).toHaveTextContent('1')
  })
  it('leaves the days-to-event figure to the KPI band rather than duplicating it inline', () => {
    renderPanel()
    expect(screen.queryByText('28 days out')).not.toBeInTheDocument()
  })
  it('opens the month grid beneath the strip', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.queryByText('SEPTEMBER 2026')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    expect(screen.getByText('SEPTEMBER 2026')).toBeInTheDocument()
  })
  it('hover previews, mouse-leave restores, click pins, Escape unpins', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    const day14 = screen.getByRole('button', { name: 'Sep 14' })
    expect(day14).toHaveAttribute('aria-pressed', 'false')
    fireEvent.mouseEnter(day14)
    expect(screen.getByText('previewing Sep 14')).toBeInTheDocument()
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    expect(day14).toHaveAttribute('aria-pressed', 'false')       // hover alone isn't "pressed"
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    fireEvent.mouseEnter(day14)
    fireEvent.click(day14)                       // pin
    expect(day14).toHaveAttribute('aria-pressed', 'true')
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()   // pinned survives leave
    await user.keyboard('{Escape}')
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    expect(day14).toHaveAttribute('aria-pressed', 'false')
  })
  it('slides the strip and fetches the uncovered range', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    expect(listCalendarRange).toHaveBeenCalledWith('o1', 'demo', expect.any(String), expect.any(String))
  })
  it('retries a range after a failed fetch instead of leaving it marked covered', async () => {
    listCalendarRange.mockClear()
    listCalendarRange.mockRejectedValueOnce(new Error('network error'))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // window -> SEP 9-18, fetch rejects
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(1))
    // A failed fetch for an uncovered window must not read as "genuinely free."
    await waitFor(() => expect(screen.getByText("Couldn't load this window — try again.")).toBeInTheDocument())
    expect(screen.queryByText('Nothing on the calendar in this window.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Earlier dates' })) // window -> AUG 30-SEP 8 (home, already covered)
    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // window -> SEP 9-18 again, fetch succeeds
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(2))
    // Clears once a subsequent fetch for the window succeeds.
    await waitFor(() => expect(screen.queryByText("Couldn't load this window — try again.")).not.toBeInTheDocument())
    expect(screen.getByText('Nothing on the calendar in this window.')).toBeInTheDocument()
  })
  it('rolls back through a second consecutive failure without falsely marking a failed range covered', async () => {
    listCalendarRange.mockClear()
    listCalendarRange.mockRejectedValueOnce(new Error('network error 1'))
    listCalendarRange.mockRejectedValueOnce(new Error('network error 2'))
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // fetch #1 rejects
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Earlier dates' })) // back home — already covered, no fetch

    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // fetch #2 rejects too
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Earlier dates' }))

    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // fetch #3 succeeds
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(3))

    // Once a fetch has actually succeeded for this range, it stays covered —
    // no further refetch on repeated visits.
    await user.click(screen.getByRole('button', { name: 'Earlier dates' }))
    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    expect(listCalendarRange).toHaveBeenCalledTimes(3)
  })

  // --- kit consumption -------------------------------------------------

  it('tones booked and tentative differently instead of one gray label', () => {
    renderPanel()
    const booked = screen.getByText('Booked')
    const tentative = screen.getByText('Tentative')
    expect(booked).toHaveAttribute('data-slot', 'status-pill')
    expect(tentative).toHaveAttribute('data-slot', 'status-pill')
    expect(booked.className).toContain('var(--status-confirmed-bg)')
    expect(tentative.className).toContain('var(--status-pending-bg)')
    expect(booked.className).not.toEqual(tentative.className)
  })

  it('renders the pager and month toggle as kit icon buttons with their labels intact', async () => {
    const user = userEvent.setup()
    renderPanel()
    for (const name of ['Toggle month', 'Earlier dates', 'Later dates']) {
      const btn = screen.getByRole('button', { name })
      expect(btn).toHaveAttribute('data-slot', 'button')
      expect(btn.className).toContain('size-6')
    }
    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    for (const name of ['Previous month', 'Next month']) {
      const btn = screen.getByRole('button', { name })
      expect(btn).toHaveAttribute('data-slot', 'button')
      expect(btn.className).toContain('size-6')
    }
  })

  it('offers a Retry control on the load-failure branch that refetches the window', async () => {
    listCalendarRange.mockClear()
    listCalendarRange.mockRejectedValueOnce(new Error('network error'))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("Couldn't load this window — try again.")).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText("Couldn't load this window — try again.")).not.toBeInTheDocument())
    expect(screen.getByText('Nothing on the calendar in this window.')).toBeInTheDocument()
  })

  it('keeps the failure state through a retry instead of flashing a false free window', async () => {
    listCalendarRange.mockClear()
    listCalendarRange.mockRejectedValueOnce(new Error('network error 1'))
    let rejectSecond!: (e: Error) => void
    listCalendarRange.mockImplementationOnce(
      () => new Promise<never>((_resolve, reject) => { rejectSecond = reject })
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    await waitFor(() => expect(screen.getByText("Couldn't load this window — try again.")).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    // In flight: ensureRange has already cleared loadFailed, but the window is
    // still unknown — the free-window message must not appear.
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled()
    expect(screen.queryByText('Nothing on the calendar in this window.')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load this window — try again.")).toBeInTheDocument()

    // Second failure resolves straight back to the failure state — never via "free".
    await act(async () => { rejectSecond(new Error('network error 2')) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled())
    expect(screen.queryByText('Nothing on the calendar in this window.')).not.toBeInTheDocument()
    expect(listCalendarRange).toHaveBeenCalledTimes(2)
  })

  it('pins the header right slot height so the calendar/preview swap cannot shift the row', async () => {
    const user = userEvent.setup()
    renderPanel()
    const slot = screen.getByRole('button', { name: 'Add to my calendar' }).parentElement!
    expect(slot.className).toContain('min-h-7')

    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Sep 14' }))
    // Same slot element, now holding the shorter pill — the pinned height is
    // what keeps the month grid below from jumping under the pointer.
    expect(screen.queryByRole('button', { name: 'Add to my calendar' })).not.toBeInTheDocument()
    expect(slot).toContainElement(screen.getByText('previewing Sep 14'))
    expect(slot.className).toContain('min-h-7')
  })

  it('renders the task rollup as a figure rather than muted gray prose', () => {
    renderPanel()
    const figure = screen.getByTestId('window-task-count')
    const value = figure.firstElementChild!
    expect(value).toHaveTextContent('1')
    expect(value.className).toContain('tabular-nums')
    expect(value.className).toContain('font-semibold')
    expect(figure).toHaveTextContent('tasks in window')
    expect(screen.queryByText('1 task across the window')).not.toBeInTheDocument()
  })

  it('makes the scrollable strip reachable and named for keyboard users', () => {
    const { container } = renderPanel()
    const strip = screen.getByRole('group', { name: 'Ten-day availability strip' })
    expect(strip).toHaveAttribute('tabindex', '0')
    expect(strip.className).toContain('overflow-x-auto')
    expect(strip).toContainElement(container.querySelector('.grid-cols-10'))
  })

  it('keeps the free-window CTA moving forward once the month grid is already open', async () => {
    listCalendarRange.mockClear()
    const user = userEvent.setup()
    const { container } = renderPanel({ initialItems: [] })
    await user.click(screen.getByRole('button', { name: 'Browse months' }))
    expect(screen.getByText('SEPTEMBER 2026')).toBeInTheDocument()

    // Still exactly one CTA, and it must not undo the tool it just opened.
    const empty = container.querySelector('[data-slot="empty-state"]')!
    expect(empty.querySelectorAll('[data-slot="button"]')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Hide months' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next 10 days' }))
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
  })

  it('gives the free-window empty state exactly one call to action', async () => {
    listCalendarRange.mockClear()
    const user = userEvent.setup()
    const { container } = renderPanel({ initialItems: [] })
    const empty = container.querySelector('[data-slot="empty-state"]')!
    expect(empty).toBeInTheDocument()
    expect(screen.getByText('Nothing on the calendar in this window.')).toBeInTheDocument()
    expect(empty.querySelectorAll('[data-slot="button"]')).toHaveLength(1)

    // At home the one CTA opens the month grid; paged away it walks back.
    await user.click(screen.getByRole('button', { name: 'Browse months' }))
    expect(screen.getByText('SEPTEMBER 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    const back = screen.getByRole('button', { name: 'Back to event week' })
    await user.click(back)
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
  })

  it('lets the ten-day strip scroll sideways rather than crushing ten columns on a phone', () => {
    const { container } = renderPanel()
    const strip = container.querySelector('.grid-cols-10')!
    expect(strip.parentElement!.className).toContain('overflow-x-auto')
    expect(strip.className).toMatch(/min-w-\[/)
  })

  it('renders the add-to-calendar affordance as a kit button', () => {
    renderPanel()
    const btn = screen.getByRole('button', { name: 'Add to my calendar' })
    expect(btn).toHaveAttribute('data-slot', 'button')
  })
})
