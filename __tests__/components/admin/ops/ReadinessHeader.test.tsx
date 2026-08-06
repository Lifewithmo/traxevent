import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  acknowledgeReview: vi.fn().mockResolvedValue(undefined),
}))

import { acknowledgeReview } from '@/actions/event-ops'
import { ReadinessHeader } from '@/components/admin/ops/ReadinessHeader'
import type { OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'], requirements: { guests: 50 },
    deadlines: [{ id: 'd1', label: 'Order beans', due: '2000-01-01', done: false }],
    shopping_list: [], packing_list: [], checklists: [],
    needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const base = {
  eventName: 'Nguyen Wedding', eventStart: '2999-09-10T00:00:00.000Z',
  orgId: 'o1', eventId: 'e1', orgSlug: 'acme', eventSlug: 'nguyen',
  complianceWarnings: [], onPlanChange: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('ReadinessHeader', () => {
  it('shows countdown, completion, and overdue flags', () => {
    render(<ReadinessHeader {...base} plan={plan()} />)
    expect(screen.getByText(/days until event/i)).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/i)).toBeInTheDocument()
  })

  it('shows the needs-review banner and clears it on acknowledge', async () => {
    const onPlanChange = vi.fn()
    render(<ReadinessHeader {...base} onPlanChange={onPlanChange} plan={plan({ needs_review: true })} />)
    expect(screen.getByText(/requirements changed/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(acknowledgeReview).toHaveBeenCalledWith('o1', 'e1'))
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ needs_review: false }))
  })

  it('surfaces an error and does not clear needs_review when acknowledge fails', async () => {
    const onPlanChange = vi.fn()
    vi.mocked(acknowledgeReview).mockRejectedValueOnce(new Error('Network error'))
    render(<ReadinessHeader {...base} onPlanChange={onPlanChange} plan={plan({ needs_review: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
    expect(onPlanChange).not.toHaveBeenCalled()
  })

  it('lists compliance documents expiring before the event', () => {
    render(<ReadinessHeader {...base} plan={plan()}
      complianceWarnings={[{ name: 'Health permit', expires_on: '2026-09-01' }]} />)
    expect(screen.getByText(/Health permit/)).toBeInTheDocument()
    expect(screen.getByText(/expires 2026-09-01/i)).toBeInTheDocument()
  })
})
