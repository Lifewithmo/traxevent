import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import type { Lead } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/nudge', () => ({ nudgeProposal: vi.fn() }))
vi.mock('@/actions/leads', () => ({ createLead: vi.fn() }))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)

const base = {
  orgId: 'o1', orgSlug: 'demo', view: 'list' as const,
  closed: [], openCount: 1, openValue: 1180,
  monthly: { wonCount: 3, wonValue: 4120, lostCount: 1, lostValue: 540 },
}

describe('PipelineListClient', () => {
  it('renders health groups with status sentences and quick actions', () => {
    render(<PipelineListClient {...base} groups={{
      needs_attention: [{ lead: lead({ title: 'Fairhaven Realty — agent open house' }),
        health: 'needs_attention', statusLine: 'Sep 4 · 60 guests · no task, no touch in 11 days',
        quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Sep 4 · 60 guests · no task, no touch in 11 days')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /set next step/i })).toBeInTheDocument()
    expect(screen.getByText(/1 open · \$1,180 · 3 booked this month/)).toBeInTheDocument()
  })
})
