import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/resources', () => ({
  createResource: vi.fn().mockResolvedValue({
    id: 'r-new', name: 'Oat milk', kind: 'consumable', unit: 'oz', unit_cost: 0.05,
    created_at: '2026-08-05T00:00:00.000Z',
  }),
  updateResource: vi.fn().mockResolvedValue(undefined),
  deleteResource: vi.fn().mockResolvedValue(undefined),
}))

import { createResource, deleteResource, updateResource } from '@/actions/resources'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import type { OpsResource, WorkPackage } from '@/lib/types'

const beans: OpsResource = {
  id: 'r1', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55,
  created_at: '2026-08-01T00:00:00.000Z',
}
const machine: OpsResource = {
  id: 'r2', name: 'Espresso Machine 02', kind: 'serialized',
  created_at: '2026-08-01T00:00:00.000Z',
}
const cups: OpsResource = {
  id: 'r3', name: 'Ceramic cups', kind: 'reusable', unit: 'each',
  created_at: '2026-08-01T00:00:00.000Z',
}
const oatMilk: OpsResource = {
  id: 'r4', name: 'Oat milk', kind: 'consumable', unit: 'oz',
  created_at: '2026-08-01T00:00:00.000Z',
}
const pkg: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 }],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ResourcesTab', () => {
  it('lists resources with kind, unit and cost', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans, machine]} packages={[pkg]} />)
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
    expect(screen.getByText('$0.55')).toBeInTheDocument()
    expect(screen.getByText('serialized')).toBeInTheDocument()
  })

  it('creates a resource from the add form', async () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[]} packages={[]} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Oat milk' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'oz' } })
    fireEvent.change(screen.getByLabelText('Unit cost ($)'), { target: { value: '0.05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add resource' }))
    await waitFor(() => expect(createResource).toHaveBeenCalledWith('o1', {
      name: 'Oat milk', kind: 'consumable', unit: 'oz', unit_cost: 0.05,
    }))
    expect(await screen.findByText('Oat milk')).toBeInTheDocument()
  })

  it('blocks deleting a resource referenced by a package', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[pkg]} />)
    const btn = screen.getByRole('button', { name: 'Delete Espresso beans' })
    expect(btn).toBeDisabled()
    expect(deleteResource).not.toHaveBeenCalled()
  })

  // The in-use guard is deliberately an inline row control, not a menu item:
  // a portal-mounted item would hide the very affordance that communicates
  // "you can't do this yet", and would swap the native attribute for
  // aria-disabled (which does not actually block activation).
  it('keeps the in-use guard on the row as a natively disabled button', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[pkg]} />)
    const btn = screen.getByRole('button', { name: 'Delete Espresso beans' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('disabled')
    expect(btn).not.toHaveAttribute('aria-disabled')
    expect(btn).toHaveAttribute('title', 'In use by a package — remove it from the package first')
    // ...and it lives in the row, not behind a trigger.
    expect(btn.closest('tr')).not.toBeNull()
  })

  it('hides write controls for non-admins', () => {
    render(<ResourcesTab orgId="o1" isAdmin={false} resources={[beans]} packages={[]} />)
    expect(screen.queryByRole('button', { name: 'Add resource' })).not.toBeInTheDocument()
  })

  it('does not write on blur when the unit cost is unchanged', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[]} />)
    const input = screen.getByLabelText('Unit cost for Espresso beans')
    fireEvent.blur(input, { target: { value: String(beans.unit_cost) } })
    expect(updateResource).not.toHaveBeenCalled()
  })

  it('clears the unit cost with null when the field is emptied', async () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[]} />)
    fireEvent.blur(screen.getByLabelText('Unit cost for Espresso beans'), { target: { value: '' } })
    await waitFor(() => expect(updateResource).toHaveBeenCalledWith('o1', 'r1', { unit_cost: null }))
  })

  it('cancelling the delete dialog does not delete', async () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso beans' }))
    expect(await screen.findByText('Delete Espresso beans?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteResource).not.toHaveBeenCalled()
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
  })

  it('confirming the delete dialog deletes the resource', async () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso beans' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith('o1', 'r1'))
    await waitFor(() => expect(screen.queryByText('Espresso beans')).not.toBeInTheDocument())
  })

  it('tones the kind pill differently per kind', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans, cups, machine]} packages={[]} />)
    const consumable = screen.getByText('consumable')
    const reusable = screen.getByText('reusable')
    const serialized = screen.getByText('serialized')

    for (const pill of [consumable, reusable, serialized]) {
      expect(pill).toHaveAttribute('data-slot', 'status-pill')
    }
    expect(consumable).toHaveClass('bg-[var(--status-neutral-bg)]')
    expect(reusable).toHaveClass('bg-[var(--status-confirmed-bg)]')
    expect(serialized).toHaveClass('bg-[var(--status-pending-bg)]')
    // No undifferentiated one-gray-badge-for-everything.
    expect(new Set([consumable.className, reusable.className, serialized.className]).size).toBe(3)
  })

  it('invites a cost on an unpriced consumable but not on other kinds', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[oatMilk, machine]} packages={[]} />)
    // The consumable's blank cost is a real gap — costing uses it.
    expect(screen.getByText('Add cost')).toBeInTheDocument()
    // The serialized unit's cost never feeds costing; its cost cell (4th) stays an em dash.
    const machineRow = screen.getByText('Espresso Machine 02').closest('tr')!
    const machineCost = machineRow.querySelectorAll('td')[3]
    expect(machineCost.textContent).toContain('—')
    expect(machineCost.textContent).not.toContain('Add cost')
  })

  it('offers a way in from the empty ledger', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[]} packages={[]} />)
    expect(screen.getByText('No resources yet')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Add your first resource' })
    fireEvent.click(cta)
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})
