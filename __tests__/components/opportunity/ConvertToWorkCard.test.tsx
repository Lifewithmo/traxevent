import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const convertOpportunityToWork = vi.hoisted(() => vi.fn())
const setLeadStage = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
const routerRefresh = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ convertOpportunityToWork, setLeadStage }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush, refresh: routerRefresh }) }))

import { ConvertToWorkCard } from '@/components/admin/opportunity/ConvertToWorkCard'
import { getEventType } from '@/lib/event-types'
import type { Event, Lead } from '@/lib/types'

const eventTypes = [getEventType('event'), getEventType('coffee-service')]
const won = { id: 'l1', name: 'Dana Kim', title: 'Nguyen Wedding', stage: 'closed_won', event_date: '2026-09-12', created_at: 'x' } as Lead
const props = { orgId: 'o1', orgSlug: 'acme', lead: won, job: null, eventTypes }

describe('ConvertToWorkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convertOpportunityToWork.mockResolvedValue({ id: 'e1', slug: 'nguyen-wedding-2026' } as Event)
    setLeadStage.mockResolvedValue(undefined)
  })

  it('shows the block reason for an opportunity that is not won', () => {
    render(<ConvertToWorkCard
      {...props}
      lead={{ ...won, stage: 'proposal' } as Lead}
      blocker="unsigned_proposal"
      blockReason="Blocked: no signed proposal yet. Signed acceptance carries the accepted package into Events."
    />)
    expect(screen.getByText(/no signed proposal yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /convert to work/i })).toBeNull()
  })

  // R4: an empty state's action slot is for the move its description names.
  // This one used to hold `<Button disabled>Convert to work</Button>` — the one
  // empty in the module whose only control could never do anything, under a
  // description that names a live next step.
  describe('the blocked empty state offers the move it names', () => {
    function blocked(blocker: 'unsigned_proposal' | 'not_won', blockReason: string) {
      render(<ConvertToWorkCard
        {...props}
        lead={{ ...won, stage: 'proposal' } as Lead}
        blocker={blocker}
        blockReason={blockReason}
      />)
    }

    it('never leaves a disabled control as the only action', () => {
      blocked('not_won', 'Ready — mark the deal won to convert.')
      for (const el of screen.getAllByRole('button')) expect(el).not.toBeDisabled()
    })

    it('marks the deal won and drops straight into the scheduler', async () => {
      const notWon = { ...won, stage: 'proposal' } as Lead
      const { rerender } = render(<ConvertToWorkCard
        {...props}
        lead={notWon}
        blocker="not_won"
        blockReason="Ready — mark the deal won to convert."
      />)
      fireEvent.click(screen.getByRole('button', { name: 'Mark won' }))
      await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'closed_won'))
      await waitFor(() => expect(routerRefresh).toHaveBeenCalled())
      // router.refresh() re-renders the tree with the won stage; the latch
      // survives it, so the operator lands in the scheduler and not back on
      // "Won, but not on the calendar" with another button to press.
      rerender(<ConvertToWorkCard {...props} lead={won} blocker="none" />)
      expect(await screen.findByLabelText('Job name')).toHaveValue('Nguyen Wedding')
      expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12')
    })

    it('says why when marking won is rejected, instead of failing silently', async () => {
      setLeadStage.mockRejectedValueOnce(new Error('offline'))
      blocked('not_won', 'Ready — mark the deal won to convert.')
      fireEvent.click(screen.getByRole('button', { name: 'Mark won' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('offline')
      expect(screen.queryByLabelText('Job name')).toBeNull()
    })

    it('points at the proposals pane when the signature is what is missing', () => {
      blocked('unsigned_proposal', 'Blocked: no signed proposal yet.')
      // A route to the control that unblocks it, NOT a third "New proposal"
      // button on a page whose proposals card already carries two.
      expect(screen.getByRole('link', { name: /go to proposals/i })).toHaveAttribute('href', '#lead-proposals')
      expect(screen.queryByRole('button', { name: /new proposal/i })).toBeNull()
    })

    it('offers no action at all rather than a dead one when the blocker is unknown', () => {
      render(<ConvertToWorkCard {...props} lead={{ ...won, stage: 'proposal' } as Lead} />)
      expect(screen.getByText(/mark the deal won to convert/i)).toBeInTheDocument()
      expect(screen.queryByRole('button')).toBeNull()
    })
  })

  // The card never unmounts — it renders one of four branches on a page that
  // router.refresh()es constantly — so fields seeded only at mount went stale.
  // Reachable path: a won deal with no event date, the operator adds the date
  // from the KPI band, the refreshed lead lands, and the scheduler still opens
  // with an EMPTY date and "Schedule job" disabled, saying nothing about why.
  it('re-seeds the form from the refreshed lead each time it is opened', () => {
    const dateless = { ...won, event_date: undefined, title: 'Old title' } as Lead
    const { rerender } = render(<ConvertToWorkCard {...props} lead={dateless} />)
    rerender(<ConvertToWorkCard {...props} lead={{ ...dateless, event_date: '2026-09-12', title: 'Nguyen Wedding', guest_count: 60 } as Lead} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12')
    expect(screen.getByLabelText('Job name')).toHaveValue('Nguyen Wedding')
    expect(screen.getByLabelText('Headcount')).toHaveValue(60)
    expect(screen.getByRole('button', { name: /^schedule job$/i })).not.toBeDisabled()
  })

  it('opens the form immediately when the open prop is set', () => {
    render(<ConvertToWorkCard {...props} open />)
    expect(screen.getByLabelText('Job name')).toBeInTheDocument()
  })

  it('prefills headcount from the opportunity guest count', () => {
    render(<ConvertToWorkCard {...props} lead={{ ...won, guest_count: 60 } as Lead} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Headcount')).toHaveValue(60)
  })

  // The linked job is a RelatedRecordCard row now: the whole row is the link, so
  // its accessible name is the job name (plus its pill), not the old "View job →"
  // anchor text.
  it('links to the job instead of offering conversion when one exists', () => {
    const job = { id: 'e1', slug: 'nguyen-wedding-2026', name: 'Nguyen Wedding' } as Event
    render(<ConvertToWorkCard {...props} job={job} />)
    expect(screen.getByRole('link', { name: /Nguyen Wedding/ })).toHaveAttribute('href', '/acme/nguyen-wedding-2026/ops')
    expect(screen.getByText('Scheduled')).toHaveClass('bg-[var(--status-confirmed-bg)]')
    expect(screen.queryByRole('button', { name: /convert to work/i })).not.toBeInTheDocument()
  })

  it('keeps showing the linked job even after the stage moves off closed_won', () => {
    const job = { id: 'e1', slug: 'nguyen-wedding-2026', name: 'Nguyen Wedding' } as Event
    render(<ConvertToWorkCard {...props} lead={{ ...won, stage: 'proposal' } as Lead} job={job} />)
    expect(screen.getByRole('link', { name: /Nguyen Wedding/ })).toHaveAttribute('href', '/acme/nguyen-wedding-2026/ops')
  })

  it('prefills the form from the opportunity', () => {
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Job name')).toHaveValue('Nguyen Wedding')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12')
  })

  it('leaves the date empty and blocks submit when the opportunity has none', () => {
    const dateless = { ...won, event_date: undefined } as Lead
    render(<ConvertToWorkCard {...props} lead={dateless} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Date')).toHaveValue('')
    expect(screen.getByRole('button', { name: /^schedule job$/i })).toBeDisabled()
  })

  it('submits the resolved event-type fields and the headcount', async () => {
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'coffee-service' } })
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalledWith('o1', 'l1', {
      name: 'Nguyen Wedding',
      date: '2026-09-12',
      event_type_id: 'coffee-service',
      registration_type: 'individual',
      headcount: 180,
    }))
  })

  // B7: the time fields seed EMPTY (the lead has no time-of-day field to
  // claim from) and flow through only when the operator types them.
  it('sends booking hours when start and end times are entered', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '15:00' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalledWith('o1', 'l1',
      expect.objectContaining({ hours: { start: '15:00', end: '19:00' } })))
  })

  it('leaves the time fields empty on open and omits hours when untouched', async () => {
    render(<ConvertToWorkCard {...props} open />)
    expect(screen.getByLabelText(/start time/i)).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalled())
    expect('hours' in convertOpportunityToWork.mock.calls[0][2]).toBe(false)
  })

  it('rejects a one-sided time range with an inline error, without converting', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '15:00' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/both a start and end time/i)
    expect(convertOpportunityToWork).not.toHaveBeenCalled()
  })

  it('rejects an end time at or before the start, without converting', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '15:00' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/end time must be after/i)
    expect(convertOpportunityToWork).not.toHaveBeenCalled()
  })

  it('surfaces a rejected conversion', async () => {
    convertOpportunityToWork.mockRejectedValue(new Error('This opportunity is already scheduled'))
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This opportunity is already scheduled')
  })

  it('passes the chosen kind to convert', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'market_day' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalledWith('o1', 'l1',
      expect.objectContaining({ kind: 'market_day' })))
  })

  it('defaults to client_job (kind omitted or client_job — no market fields sent)', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalled())
    const arg = convertOpportunityToWork.mock.calls[0][2]
    expect(arg.kind ?? 'client_job').toBe('client_job')
  })

  it('redirects a market-day conversion to the dashboard, not ops (market-day nav has no Ops page)', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'market_day' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/acme/nguyen-wedding-2026/dashboard'))
  })

  it('redirects a client-job conversion to ops as before', async () => {
    render(<ConvertToWorkCard {...props} open />)
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/acme/nguyen-wedding-2026/ops'))
  })
})
