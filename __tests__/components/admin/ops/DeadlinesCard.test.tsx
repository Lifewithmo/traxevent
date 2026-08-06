import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  toggleDeadline: vi.fn().mockResolvedValue(undefined),
}))

import { toggleDeadline } from '@/actions/event-ops'
import { DeadlinesCard } from '@/components/admin/ops/DeadlinesCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 10 },
  deadlines: [
    { id: 'd1', label: 'Order consumables', due: '2000-01-01', done: false },
    { id: 'd2', label: 'Final payment', due: '2999-01-01', done: true },
  ],
  shopping_list: [], packing_list: [], checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('DeadlinesCard', () => {
  it('renders deadlines and highlights overdue', () => {
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="coffee-cart" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Order consumables')).toBeInTheDocument()
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })

  it('toggles a deadline and reports the new plan upward', async () => {
    const onPlanChange = vi.fn()
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="coffee-cart" onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Order consumables'))
    await waitFor(() => expect(toggleDeadline).toHaveBeenCalledWith('o1', 'e1', 'd1', true))
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({
      deadlines: expect.arrayContaining([expect.objectContaining({ id: 'd1', done: true })]),
    }))
  })

  it('notes the general-template fallback for packs without their own deadlines', () => {
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="florist" onPlanChange={vi.fn()} />)
    expect(screen.getByText(/general deadline defaults/i)).toBeInTheDocument()
  })
})
