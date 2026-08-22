import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const bulkRescheduleAgenda = vi.fn()
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: (...a: unknown[]) => bulkRescheduleAgenda(...a),
}))

import { AgendaView } from '@/components/admin/calendar/AgendaView'
import { todayYmd } from '@/lib/opportunity-detail'
import { CALENDAR_KIND_LABELS, type CalendarItem } from '@/lib/calendar'

const TODAY = '2026-08-19'

// Three days behind, three ahead — the whole point of anchoring.
const past: CalendarItem[] = [
  { id: 'p1', title: 'Spring gala', date: '2026-01-05', kind: 'event', href: '/acme/spring/dashboard' },
  { id: 'p2', title: 'March market', date: '2026-03-02', kind: 'event', href: '/acme/march/dashboard' },
  { id: 'p3', title: 'Yesterday hold', date: '2026-08-18', kind: 'lead', href: '/acme/leads/p3' },
]
const future: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: '2026-08-19', kind: 'event', href: '/acme/wedding/dashboard' },
  { id: 'i1', title: 'Deposit invoice', date: '2026-08-20', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'far', title: 'Autumn gala', date: '2026-09-05', kind: 'event', href: '/acme/gala/dashboard' },
]
const items = [...past, ...future]

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  refresh.mockClear()
  bulkRescheduleAgenda.mockReset()
  bulkRescheduleAgenda.mockResolvedValue({ moved: 1, failures: [] })
})

describe('AgendaView — anchoring', () => {
  it('opens on today, not on the org’s oldest record', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    expect(screen.getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Autumn gala' })).toBeInTheDocument()
    // history is NOT the landing spot
    expect(screen.queryByRole('link', { name: 'Spring gala' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Yesterday hold' })).not.toBeInTheDocument()
  })

  it('anchors on the open spine day when one is in scope', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} selectedDay="2026-09-01" />)
    expect(screen.getByRole('link', { name: 'Autumn gala' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Wedding' })).not.toBeInTheDocument()
  })

  it('falls back to today when the spine day is outside the feed', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} selectedDay="2031-01-01" />)
    expect(screen.getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
  })

  it('falls back to the browser’s local date when the canvas passes no today', () => {
    const onlyToday: CalendarItem[] = [
      { id: 'old', title: 'Ancient job', date: '2001-01-01', kind: 'event', href: '/acme/old/dashboard' },
      { id: 'now', title: 'Job today', date: todayYmd(), kind: 'event', href: '/acme/now/dashboard' },
    ]
    render(<AgendaView orgSlug="acme" items={onlyToday} />)
    expect(screen.getByRole('link', { name: 'Job today' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ancient job' })).not.toBeInTheDocument()
  })

  it('keeps history reachable behind an explicit Load earlier', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('button', { name: /load earlier/i }))
    expect(screen.getByRole('link', { name: 'Spring gala' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
  })

  it('marks where today falls once history is pulled in above it', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /load earlier/i }))
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('offers a way back to today after wandering into history', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('button', { name: /load earlier/i }))
    fireEvent.click(screen.getByRole('button', { name: /back to today/i }))
    expect(screen.queryByRole('link', { name: 'Spring gala' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
  })

  it('renders a specific next action when everything is behind us', () => {
    render(<AgendaView orgSlug="acme" items={past} today={TODAY} />)
    expect(screen.getByText(/nothing on or after/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
    expect(screen.getByRole('button', { name: /load earlier/i })).toBeInTheDocument()
  })
})

describe('AgendaView — bounded render', () => {
  const many: CalendarItem[] = Array.from({ length: 420 }, (_, n) => ({
    id: `m${n}`,
    title: `Job ${n}`,
    date: `2026-08-19`,
    kind: 'event' as const,
    href: `/acme/j${n}/dashboard`,
  }))

  it('renders a bounded page, not all 420 rows', () => {
    render(<AgendaView orgSlug="acme" items={many} today={TODAY} />)
    expect(screen.getAllByRole('link')).toHaveLength(40)
    expect(screen.getByText(/Showing/).textContent).toBe('Showing 40 of 420')
  })

  it('grows one page at a time on Load later', () => {
    render(<AgendaView orgSlug="acme" items={many} today={TODAY} />)
    fireEvent.click(screen.getByRole('button', { name: /load later/i }))
    expect(screen.getAllByRole('link')).toHaveLength(80)
  })
})

describe('AgendaView — months', () => {
  it('groups by month with sticky headers', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    const august = screen.getByRole('heading', { name: 'August 2026' })
    expect(august).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(august.className).toContain('sticky')
    expect(august.className).toContain('top-0')
  })

  it('shows an invoice amount alongside its row', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  it('renders one specific CTA when the feed is empty', () => {
    render(<AgendaView orgSlug="acme" items={[]} today={TODAY} />)
    expect(screen.getByText(/nothing on the calendar/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
  })
})

describe('AgendaView — kind is never colour alone (WCAG 1.4.1)', () => {
  it('pairs every kind dot with a visually hidden kind name', () => {
    const oneOfEach: CalendarItem[] = (Object.keys(CALENDAR_KIND_LABELS) as Array<CalendarItem['kind']>).map((kind, n) => ({
      id: `k${n}`, title: `Row ${kind}`, date: TODAY, kind, href: `/acme/x${n}`,
    }))
    render(<AgendaView orgSlug="acme" items={oneOfEach} today={TODAY} />)
    for (const label of Object.values(CALENDAR_KIND_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('AgendaView — multi-select', () => {
  it('gives every reschedulable row a checkbox whose name identifies it', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    expect(screen.getByRole('checkbox', { name: /select wedding on aug 19, 2026/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /select autumn gala on sep 5, 2026/i })).toBeInTheDocument()
  })

  it('offers no checkbox on rows whose date it cannot honestly move', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    // invoice_due is in view (its $500 renders) but carries no selection control
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /deposit invoice/i })).not.toBeInTheDocument()
    // select-all + the two reschedulable rows, and nothing else
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('counts the selection, announces it, and clears on Escape', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    const live = screen.getByText('1 row selected')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('role', 'status')
    expect(live.className).toContain('sr-only')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('select-all covers only the reschedulable rows in view, and toggles back off', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    const all = screen.getByRole('checkbox', { name: /select all 2 reschedulable rows in view/i })
    fireEvent.click(all)
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(all)
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })

  it('clears from the bulk bar', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('keeps the selection while the window grows', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    fireEvent.click(screen.getByRole('button', { name: /load earlier/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('pre-fills the target day and warns about what is already booked there', () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select autumn gala/i }))
    const field = screen.getByLabelText(/move the selected rows to this day/i)
    // 2026-08-19 carries the Wedding, so the computed default steps past it
    expect(field).toHaveValue('2026-08-20')
    fireEvent.change(field, { target: { value: '2026-08-19' } })
    expect(screen.getByText(/1 booked item is already on aug 19, 2026/i)).toBeInTheDocument()
  })
})

describe('AgendaView — bulk reschedule', () => {
  function selectAndMove(to: string) {
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    fireEvent.change(screen.getByLabelText(/move the selected rows to this day/i), { target: { value: to } })
    fireEvent.click(screen.getByRole('button', { name: /^move 1$/i }))
  }

  it('sends the selection to the server action as real moves', async () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    selectAndMove('2026-09-20')
    await waitFor(() =>
      expect(bulkRescheduleAgenda).toHaveBeenCalledWith('acme', [{ kind: 'event', id: 'e1', date: '2026-09-20' }])
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('moves the row optimistically, before the server answers', async () => {
    const d = deferred<{ moved: number; failures: never[] }>()
    bulkRescheduleAgenda.mockReturnValue(d.promise)
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)

    // Wedding starts in August…
    expect(within(screen.getByRole('heading', { name: 'August 2026' }).parentElement!).getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    selectAndMove('2026-09-20')
    // …and lands in September without waiting for the round trip.
    await waitFor(() =>
      expect(within(screen.getByRole('heading', { name: 'September 2026' }).parentElement!).getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    )
    expect(refresh).not.toHaveBeenCalled()
    d.resolve({ moved: 1, failures: [] })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('restores the list AND the selection when the action throws', async () => {
    bulkRescheduleAgenda.mockRejectedValue(new Error('Forbidden'))
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    selectAndMove('2026-09-20')

    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument())
    // back where it was — no silent move
    expect(within(screen.getByRole('heading', { name: 'August 2026' }).parentElement!).getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rolls back only the rows the server could not move', async () => {
    bulkRescheduleAgenda.mockResolvedValue({
      moved: 1,
      failures: [{ kind: 'event', id: 'e1', message: 'Job not found' }],
    })
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select all 2 reschedulable rows in view/i }))
    fireEvent.change(screen.getByLabelText(/move the selected rows to this day/i), { target: { value: '2026-10-10' } })
    fireEvent.click(screen.getByRole('button', { name: /^move 2$/i }))

    await waitFor(() => expect(screen.getByText(/1 of 2 could not move — Job not found/i)).toBeInTheDocument())
    // the failed row is back in August; the successful one is in October
    expect(within(screen.getByRole('heading', { name: 'August 2026' }).parentElement!).getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    // and the failed row is re-selected so a retry costs no re-picking
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('offers an undo that puts the rows back on their original days', async () => {
    render(<AgendaView orgSlug="acme" items={items} today={TODAY} />)
    selectAndMove('2026-09-20')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())
    expect(screen.getByText(/1 item moved to Sep 20, 2026/i)).toBeInTheDocument()

    bulkRescheduleAgenda.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(bulkRescheduleAgenda).toHaveBeenCalledWith('acme', [{ kind: 'event', id: 'e1', date: '2026-08-19' }])
    )
    await waitFor(() =>
      expect(within(screen.getByRole('heading', { name: 'August 2026' }).parentElement!).getByRole('link', { name: 'Wedding' })).toBeInTheDocument()
    )
  })

  it('never fires for a row it cannot act on', async () => {
    // only the invoice is in view → no checkboxes at all, so no bulk bar
    render(<AgendaView orgSlug="acme" items={[future[1]]} today={TODAY} />)
    expect(screen.queryByRole('button', { name: /^move/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1) // select-all only…
    expect(screen.getByRole('checkbox', { name: /select all 0 reschedulable/i })).toBeDisabled()
  })
})
