import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DaySpine } from '@/components/admin/calendar/DaySpine'
import type { DayDetail } from '@/actions/calendar'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event, Lead, NormalizedInvoice, Proposal } from '@/lib/types'

const event = {
  id: 'e1',
  name: 'Ceremony at Alder',
  slug: 'ceremony-alder',
  status: 'active',
  event_start: '2026-08-22',
  event_end: '2026-08-22',
  hours: { start: '16:00', end: '21:00' },
  lead_id: 'l1',
} as Event

const job = {
  id: 'l1',
  title: 'Alder & Vine wedding',
  name: 'Alder & Vine',
  stage: 'closed_won',
  estimated_value: 12000,
  event_date: '2026-08-22',
} as Lead

const proposal = {
  id: 'p1',
  lead_id: 'l1',
  title: 'Full-day package',
  status: 'accepted',
  selection: { selected_total: 3500 },
  line_items: [],
} as unknown as Proposal

const invoice = {
  id: 'i1',
  lead_id: 'l1',
  number: '1001',
  title: 'Deposit',
  lifecycle: 'sent',
  due_date: '2026-08-15',
  payments: [],
  line_items: [{ description: 'Deposit', quantity: 1, unit_price: 1500 }],
} as unknown as NormalizedInvoice

const task: CalendarItem = {
  id: 't1',
  title: 'Confirm power access',
  date: '2026-08-22',
  kind: 'task',
  href: '/acme/leads/l1',
  detail: 'Before load-in',
}

const blocker: CalendarItem = {
  id: 'c1',
  title: 'Insurance expires',
  date: '2026-08-22',
  kind: 'compliance',
  href: '/acme/compliance',
  blocker: true,
  detail: 'blocks Ceremony at Alder',
}

const detail: DayDetail = {
  ymd: '2026-08-22',
  events: [event],
  tasks: [task],
  blockers: [blocker],
  drops: [],
  related: { e1: { job, proposals: [proposal], invoices: [invoice] } },
}

const runway: RunwayJob[] = [
  { eventId: 'e1', title: 'Ceremony at Alder', date: '2026-08-22', inflowBefore: 900, dueAfter: 0 },
]

describe('DaySpine', () => {
  it('renders the day event with its working hours', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Ceremony at Alder')).toBeInTheDocument()
    expect(screen.getByText('16:00 – 21:00')).toBeInTheDocument()
  })

  it('renders the linked job, proposal and invoice as related rows with amounts', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Alder & Vine wedding')).toBeInTheDocument()
    expect(screen.getByText('Full-day package')).toBeInTheDocument()
    expect(screen.getByText('$3,500')).toBeInTheDocument()
    expect(screen.getByText('Invoice 1001')).toBeInTheDocument()
    expect(screen.getByText('$1,500')).toBeInTheDocument()
  })

  it('folds blockers into the spine inline (no separate attention rail)', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Insurance expires')).toBeInTheDocument()
  })

  it('shows the prep tasks for the day', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Confirm power access')).toBeInTheDocument()
  })

  it('shows the day’s runway line for the booked job (receivables timing)', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText(/expected to land before this job/i)).toBeInTheDocument()
  })

  it('shows a hour-less event as "time TBD"', () => {
    const noHours: DayDetail = {
      ...detail,
      events: [{ ...event, hours: undefined } as Event],
      tasks: [],
      blockers: [],
    }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={noHours} runway={[]} />)
    expect(screen.getByText(/time tbd/i)).toBeInTheDocument()
  })

  it('renders one specific CTA when the day holds nothing', () => {
    const empty: DayDetail = { ymd: '2026-08-22', events: [], tasks: [], blockers: [], drops: [], related: {} }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={empty} runway={[]} />)
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
  })
})
