import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/work-packages', () => ({
  createWorkPackage: vi.fn().mockImplementation(async (_orgId: string, input: object) => ({
    id: 'p-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  updateWorkPackage: vi.fn().mockResolvedValue(undefined),
  deleteWorkPackage: vi.fn().mockResolvedValue(undefined),
}))

import { createWorkPackage, updateWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import type { OpsResource, WorkPackage, ChecklistTemplate } from '@/lib/types'

const beans: OpsResource = {
  id: 'r1', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55,
  created_at: '2026-08-01T00:00:00.000Z',
}
const machine: OpsResource = {
  id: 'r2', name: 'Espresso Machine 02', kind: 'serialized',
  created_at: '2026-08-01T00:00:00.000Z',
}
const prepTemplate: ChecklistTemplate = {
  id: 'bi-cc-prep', name: 'Prep', phase: 'prep',
  steps: [{ text: 'Dial in grinder', evidence: 'none' }],
  created_at: '2026-08-01T00:00:00.000Z',
}
const espressoBar: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900, max_guests: 100,
  lines: [
    { kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 },
    { kind: 'equipment', resource_id: 'r2', qty: 1 },
    { kind: 'labor', role: 'barista', count: 2 },
  ],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('PackagesTab', () => {
  it('lists packages with price and line summary', () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[espressoBar]} resources={[beans, machine]} templates={[prepTemplate]} />)
    expect(screen.getByText('Espresso Bar')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText(/0\.75 oz × guests/)).toBeInTheDocument()
    expect(screen.getByText(/barista × 2/)).toBeInTheDocument()
  })

  it('creates a package with a consumable line and an attached checklist', async () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[]} resources={[beans, machine]} templates={[prepTemplate]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New package' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cold Brew Cart' } })
    fireEvent.change(screen.getByLabelText('Price ($)'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByLabelText('Attach Prep'))
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(createWorkPackage).toHaveBeenCalledWith('o1', {
      name: 'Cold Brew Cart',
      price: 600,
      lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 0.5, unit: 'oz' } }],
      checklist_template_ids: ['bi-cc-prep'],
    }))
  })

  it('lets the operator pick a different compatible unit for a consumable line', async () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[]} resources={[beans, machine]} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New package' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bulk Brew' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.05' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 unit'), { target: { value: 'lb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(createWorkPackage).toHaveBeenCalledWith('o1', expect.objectContaining({
      lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 0.05, unit: 'lb' } }],
    })))
  })

  it('warns before deleting a package', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PackagesTab orgId="o1" isAdmin packages={[espressoBar]} resources={[beans, machine]} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso Bar' }))
    expect(confirmSpy.mock.calls[0][0]).toMatch(/events already set up with it will fail/i)
    expect(deleteWorkPackage).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('hides write controls for non-admins', () => {
    render(<PackagesTab orgId="o1" isAdmin={false} packages={[espressoBar]} resources={[]} templates={[]} />)
    expect(screen.queryByRole('button', { name: 'New package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Espresso Bar' })).not.toBeInTheDocument()
  })

  it('clearing max_guests on edit sends null and drops the guests badge', async () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[espressoBar]} resources={[beans, machine]} templates={[]} />)
    expect(screen.getByText(/up to 100 guests/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Max guests'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(updateWorkPackage).toHaveBeenCalledWith('o1', 'p1', expect.objectContaining({ max_guests: null }))
    )
    expect(screen.queryByText(/up to 100 guests/)).not.toBeInTheDocument()
  })

  it('disables Save until every consumable line has a resource and a positive qty per guest', () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[]} resources={[beans, machine]} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New package' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cold Brew Cart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    expect(screen.getByRole('button', { name: 'Save package' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    expect(screen.getByRole('button', { name: 'Save package' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.5' } })
    expect(screen.getByRole('button', { name: 'Save package' })).not.toBeDisabled()
  })
})
