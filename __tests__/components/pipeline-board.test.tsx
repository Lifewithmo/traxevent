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
  openCount: 1, openValue: 1180,
  monthly: { wonCount: 3, wonValue: 4120, lostCount: 1, lostValue: 540 },
}

describe('PipelineBoardView', () => {
  it('renders the three open columns, the won/lost strip, and health on cards', () => {
    const { container } = render(<PipelineBoardView {...base} groups={{
      needs_attention: [{ lead: lead({ title: 'Fairhaven Realty — agent open house' }),
        health: 'needs_attention', statusLine: 'Sep 4 · 60 guests · no task, no touch in 11 days',
        quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    expect(screen.getByRole('heading', { name: 'Inquiry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Consultation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
    expect(screen.getByText(/Won this month: 3 · \$4,120 — moved to/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument()
    expect(container.querySelector('[data-health="needs_attention"]')).not.toBeNull()
  })

  it('refreshes after a successful non-won stage move, to reconcile stale health/statusLine', async () => {
    vi.mocked(setLeadStage).mockResolvedValue(undefined as never)
    render(<PipelineBoardView {...base} groups={{
      needs_attention: [{ lead: lead({ id: 'l1' }),
        health: 'needs_attention', statusLine: 'stale sentence', quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    fireEvent.change(screen.getByRole('combobox', { name: /Stage for/ }), { target: { value: 'proposal' } })
    await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'proposal'))
    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
