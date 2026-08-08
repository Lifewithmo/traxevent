import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'
import type { Lead } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/leads', () => ({ createLead: vi.fn(), setLeadStage: vi.fn() }))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)

const base = {
  orgId: 'o1', orgSlug: 'demo',
  closed: [], openCount: 1, openValue: 1180,
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
})
