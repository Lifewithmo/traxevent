import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import type { Lead } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('@/actions/nudge', () => ({ nudgeProposal: vi.fn() }))
// 'use server' modules backed by firebase-admin — mocked like NewOpportunityForm's
// createLead mock in new-opportunity-form-linked.test.tsx.
vi.mock('@/actions/leads', () => ({ createLead: vi.fn() }))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: vi.fn().mockResolvedValue('tok123'),
  regenerateIntakeToken: vi.fn().mockResolvedValue('tok456'),
}))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Halcyon Studios', stage: 'proposal', created_at: 't', updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o1', orgSlug: 'demo',
  groups: {
    needs_attention: [{ lead: lead({}), health: 'needs_attention' as const, statusLine: 'Proposal sent 6 days ago — no opens' }],
    waiting: [], active: [],
  },
  closed: [],
  openCount: 1, openValue: 4800,
  monthly: { wonCount: 2, wonValue: 6300, lostCount: 1, lostValue: 800 },
}

describe('PipelineListClient', () => {
  it('renders exactly one intake link control block', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    expect(screen.getAllByRole('button', { name: 'Intake link' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Intake link' }))
    expect(container.querySelectorAll('[data-intake-card]')).toHaveLength(1)
  })

  it('shows the won/lost month summary', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByText(/Won this month: 2 · \$6,300/)).toBeInTheDocument()
    expect(screen.getByText(/Lost: 1 · \$800 · archived/)).toBeInTheDocument()
  })

  it('renders a needs-attention statusLine in the destructive tone', () => {
    render(<PipelineListClient {...baseProps} />)
    const line = screen.getByText('Proposal sent 6 days ago — no opens')
    expect(line.className).toContain('text-destructive')
  })
})
