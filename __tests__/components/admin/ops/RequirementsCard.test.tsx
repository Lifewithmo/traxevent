import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const freshPlan = {
  package_ids: ['p1'], requirements: { guests: 120, notes: 'gate code 4411' },
  deadlines: [], shopping_list: [], packing_list: [], checklists: [],
  needs_review: true,
  change_log: [{ at: '2026-08-05T10:00:00.000Z', by: 'u1', field: 'guests', from: '80', to: '120' }],
  created_at: '2026-08-01T00:00:00.000Z',
}

vi.mock('@/actions/event-ops', () => ({
  updateOpsRequirements: vi.fn().mockResolvedValue(undefined),
  getOpsPlan: vi.fn().mockImplementation(async () => freshPlan),
}))

import { updateOpsRequirements, getOpsPlan } from '@/actions/event-ops'
import { RequirementsCard } from '@/components/admin/ops/RequirementsCard'
import type { OpsPlan, WorkPackage } from '@/lib/types'

const pkg: WorkPackage = { id: 'p1', name: 'Espresso Bar', price: 900, lines: [], created_at: '2026-08-01T00:00:00.000Z' }
const plan: OpsPlan = {
  package_ids: ['p1'], requirements: { guests: 80, site_needs: ['power'] },
  deadlines: [], shopping_list: [], packing_list: [], checklists: [],
  needs_review: false,
  change_log: [{ at: '2026-08-04T10:00:00.000Z', by: 'u1', field: 'guests', from: '50', to: '80' }],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('RequirementsCard', () => {
  it('shows requirements and package names', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('Espresso Bar')).toBeInTheDocument()
    expect(screen.getByText('power')).toBeInTheDocument()
  })

  it('saves only changed fields and refreshes the plan', async () => {
    const onPlanChange = vi.fn()
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateOpsRequirements).toHaveBeenCalledWith('o1', 'e1', { guests: 120 }))
    await waitFor(() => expect(getOpsPlan).toHaveBeenCalledWith('o1', 'e1'))
    expect(onPlanChange).toHaveBeenCalledWith(freshPlan)
  })

  it('renders the change log', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByText(/change log/i))
    expect(screen.getByText(/guests: 50 → 80/)).toBeInTheDocument()
  })
})
