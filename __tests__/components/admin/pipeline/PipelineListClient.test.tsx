import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import type { Lead } from '@/lib/types'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/actions/nudge', () => ({ nudgeProposal: vi.fn() }))
// 'use server' modules backed by firebase-admin — mocked like NewOpportunityForm's
// createLead mock in new-opportunity-form-linked.test.tsx.
const setLeadStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ createLead: vi.fn(), setLeadStage: (...args: unknown[]) => setLeadStage(...args) }))
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
  beforeEach(() => {
    setLeadStage.mockClear()
    push.mockClear()
    refresh.mockClear()
    const slot = document.createElement('div')
    slot.id = 'tx-pipeline-actions'
    document.body.appendChild(slot)
  })

  afterEach(() => {
    cleanup()
    document.getElementById('tx-pipeline-actions')?.remove()
  })

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

  it('renders a flat row with a destructive left accent when needs attention', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    const row = container.querySelector('[data-row="l1"]') as HTMLElement
    expect(row).toBeTruthy()
    expect(row.style.borderLeft).toContain('destructive')
  })

  it('renders a StageChip per row', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByRole('button', { name: /Stage: Proposal/ })).toBeInTheDocument()
  })

  it('shows an advance button labeled with the next stage and calls setLeadStage', () => {
    render(<PipelineListClient {...baseProps} />)
    const advance = screen.getByRole('button', { name: 'Move to Closed Won' })
    fireEvent.click(advance)
    expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'closed_won')
  })

  it('shows Move to Consultation for an inquiry-stage row', () => {
    const props = {
      ...baseProps,
      groups: {
        needs_attention: [],
        waiting: [],
        active: [{ lead: { id: 'l2', name: 'Foo', stage: 'inquiry' as const, created_at: 't', updated_at: 't' } as Lead, health: 'active' as const, statusLine: 'Waiting on reply' }],
      },
    }
    render(<PipelineListClient {...props} />)
    expect(screen.getByRole('button', { name: 'Move to Consultation' })).toBeInTheDocument()
  })
})
