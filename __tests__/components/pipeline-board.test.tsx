import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'
import { setLeadStage } from '@/actions/leads'
import type { Lead } from '@/lib/types'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/actions/leads', () => ({ createLead: vi.fn(), setLeadStage: vi.fn() }))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)

const base = {
  orgId: 'o1', orgSlug: 'demo',
  monthly: { wonCount: 3, wonValue: 4120, lostCount: 1, lostValue: 540 },
}

describe('PipelineBoardView', () => {
  it('renders the three open columns, the won/lost figures, and health on cards', () => {
    const { container } = render(<PipelineBoardView {...base} groups={{
      needs_attention: [{ lead: lead({ title: 'Fairhaven Realty — agent open house' }),
        health: 'needs_attention', statusLine: 'Sep 4 · 60 guests · no task, no touch in 11 days',
        quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    expect(screen.getByRole('heading', { name: 'Inquiry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Consultation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
    // The month rollup is the LOSS side plus the calendar route. The won money
    // is the KPI band's "Booked this month" — the identical
    // `wonValueInMonth(leads, ym)` call — so rendering it here too would put one
    // figure on the page twice.
    expect(screen.getByText('Lost this month')).toBeInTheDocument()
    expect(screen.getByText('$540')).toBeInTheDocument()
    expect(screen.queryByText('Won this month')).toBeNull()
    expect(screen.queryByText('$4,120')).toBeNull()
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument()
    expect(container.querySelector('[data-health="needs_attention"]')).not.toBeNull()
  })

  it('refreshes after a successful non-won stage move, to reconcile stale health/statusLine', async () => {
    // setLeadStage returns { ok: true } on a completed write (increment 4 —
    // a discriminated return value, not a thrown error).
    vi.mocked(setLeadStage).mockResolvedValue({ ok: true })
    render(<PipelineBoardView {...base} groups={{
      needs_attention: [{ lead: lead({ id: 'l1' }),
        health: 'needs_attention', statusLine: 'stale sentence', quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Consultation/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Proposal' }))
    await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'proposal'))
    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
