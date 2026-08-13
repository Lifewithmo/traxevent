import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'
import type { Lead } from '@/lib/types'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
const setLeadStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ setLeadStage: (...args: unknown[]) => setLeadStage(...args), createLead: vi.fn() }))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: vi.fn().mockResolvedValue('tok123'),
  regenerateIntakeToken: vi.fn().mockResolvedValue('tok456'),
}))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Halcyon Studios', stage: 'inquiry', created_at: 't', updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o1', orgSlug: 'demo',
  groups: {
    needs_attention: [],
    waiting: [],
    active: [{ lead: lead({ estimated_value: 1200 }), health: 'active' as const, statusLine: 'Waiting on reply' }],
  },
  openCount: 1, openValue: 1200,
  monthly: { wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0 },
}

describe('PipelineBoardView', () => {
  beforeEach(() => {
    setLeadStage.mockClear()
    push.mockClear()
    const slot = document.createElement('div')
    slot.id = 'tx-pipeline-actions'
    document.body.appendChild(slot)
  })

  afterEach(() => {
    cleanup()
    document.getElementById('tx-pipeline-actions')?.remove()
  })

  it('moves a card stage with arrow keys', async () => {
    render(<PipelineBoardView {...baseProps} />)
    const card = screen.getByRole('article', { name: /Halcyon Studios/ })
    card.focus()
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'consultation')
  })

  it('does not move stage when arrow keys fire from a focused descendant', () => {
    render(<PipelineBoardView {...baseProps} />)
    const trigger = screen.getByRole('button', { name: /Stage: Inquiry/ })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    expect(setLeadStage).not.toHaveBeenCalled()
  })

  it('renders uppercase column headers with count and value', () => {
    render(<PipelineBoardView {...baseProps} />)
    expect(screen.getByText('1 · $1,200')).toBeInTheDocument()
  })

  it('routes Mark lost to the opportunity page', () => {
    render(<PipelineBoardView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(push).toHaveBeenCalledWith('/demo/leads/l1?focus=lost')
  })
})
