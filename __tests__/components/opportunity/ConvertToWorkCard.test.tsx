import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const convertOpportunityToWork = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ convertOpportunityToWork }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush, refresh: vi.fn() }) }))

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
  })

  it('shows the block reason with a disabled button for an opportunity that is not won', () => {
    render(<ConvertToWorkCard
      {...props}
      lead={{ ...won, stage: 'proposal' } as Lead}
      blockReason="Blocked: no accepted proposal yet. Acceptance carries the package into Events."
    />)
    expect(screen.getByText(/no accepted proposal yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /convert to work/i })).toBeDisabled()
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

  it('links to the job instead of offering conversion when one exists', () => {
    const job = { id: 'e1', slug: 'nguyen-wedding-2026', name: 'Nguyen Wedding' } as Event
    render(<ConvertToWorkCard {...props} job={job} />)
    expect(screen.getByRole('link', { name: /view job/i })).toHaveAttribute('href', '/acme/nguyen-wedding-2026/ops')
    expect(screen.queryByRole('button', { name: /convert to work/i })).not.toBeInTheDocument()
  })

  it('keeps showing the linked job even after the stage moves off closed_won', () => {
    const job = { id: 'e1', slug: 'nguyen-wedding-2026', name: 'Nguyen Wedding' } as Event
    render(<ConvertToWorkCard {...props} lead={{ ...won, stage: 'proposal' } as Lead} job={job} />)
    expect(screen.getByRole('link', { name: /view job/i })).toHaveAttribute('href', '/acme/nguyen-wedding-2026/ops')
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
