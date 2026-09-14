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

  it('disables Save when guests is not positive, re-enables once fixed', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '100' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('resets the draft on Cancel so re-opening Edit shows the original value', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Guests')).toHaveValue(80)
  })

  // ── Per-event buffer overrides (inc-3 S3.1) ────────────────────────────────

  it('blank buffer inputs show what they inherit: the org default when set, else the constants', () => {
    const { unmount } = render(
      <RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()}
        orgBuffers={{ pack_minutes: 50, drive_minutes: 20 }} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Pack time (minutes)')).toHaveAttribute('placeholder', '50')
    expect(screen.getByLabelText('Drive time (minutes)')).toHaveAttribute('placeholder', '20')
    expect(screen.getByText(/Blank inherits 50m pack · 20m drive/)).toBeInTheDocument()
    unmount()
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Pack time (minutes)')).toHaveAttribute('placeholder', '45')
    expect(screen.getByLabelText('Drive time (minutes)')).toHaveAttribute('placeholder', '30')
  })

  it('saves the override through the EXISTING requirements path as a full replace-the-scalar object', async () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()}
      orgBuffers={{ pack_minutes: 50, drive_minutes: 20 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Drive time (minutes)'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(updateOpsRequirements).toHaveBeenCalledWith('o1', 'e1', { buffers: { drive_minutes: 90 } }),
    )
  })

  it('does NOT send buffers when the override is untouched (no spurious attestation clear)', async () => {
    const withOverride: OpsPlan = {
      ...plan,
      requirements: { ...plan.requirements, buffers: { drive_minutes: 90 } },
    }
    render(<RequirementsCard orgId="o1" eventId="e1" plan={withOverride} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateOpsRequirements).toHaveBeenCalledWith('o1', 'e1', { guests: 120 }))
  })

  it('blocks invalid buffer minutes with the shared-ceiling copy and disables Save', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Drive time (minutes)'), { target: { value: '481' } })
    expect(screen.getByText(/whole number between 1 and 480/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Drive time (minutes)'), { target: { value: '90' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('view mode names the override source with the SHARED assumption vocabulary', () => {
    const withOverride: OpsPlan = {
      ...plan,
      requirements: { ...plan.requirements, buffers: { drive_minutes: 90 } },
    }
    render(<RequirementsCard orgId="o1" eventId="e1" plan={withOverride} packages={[pkg]} onPlanChange={vi.fn()}
      orgBuffers={{ pack_minutes: 50, drive_minutes: 20 }} />)
    expect(screen.getByText('assumes 50m pack · 90m drive · drive set for this job')).toBeInTheDocument()
  })
})
