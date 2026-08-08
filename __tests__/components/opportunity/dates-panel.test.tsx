import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

function renderPanel() {
  return render(<DatesPanel orgId="o1" orgSlug="demo" lead={lead} today="2026-08-07" initialItems={items} />)
}

describe('DatesPanel', () => {
  it('renders the event-centred window, distance, and list', () => {
    renderPanel()
    expect(screen.getByText('Dates')).toBeInTheDocument()
    expect(screen.getByText('28 days out')).toBeInTheDocument()
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    expect(screen.getByText(/Mission Co-op/)).toBeInTheDocument()      // event line
    expect(screen.getByText(/Farmers market stall/)).toBeInTheDocument() // tentative line
    expect(screen.getByText('1 task across the window')).toBeInTheDocument()
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
    fireEvent.mouseEnter(day14)
    expect(screen.getByText('previewing Sep 14')).toBeInTheDocument()
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    fireEvent.mouseEnter(day14)
    fireEvent.click(day14)                       // pin
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()   // pinned survives leave
    await user.keyboard('{Escape}')
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Earlier dates' })) // window -> AUG 30-SEP 8 (home, already covered)
    await user.click(screen.getByRole('button', { name: 'Later dates' }))   // window -> SEP 9-18 again
    await waitFor(() => expect(listCalendarRange).toHaveBeenCalledTimes(2))
  })
})
