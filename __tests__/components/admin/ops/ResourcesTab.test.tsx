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

import { createResource, deleteResource } from '@/actions/resources'
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

  it('hides write controls for non-admins', () => {
    render(<ResourcesTab orgId="o1" isAdmin={false} resources={[beans]} packages={[]} />)
    expect(screen.queryByRole('button', { name: 'Add resource' })).not.toBeInTheDocument()
  })
})
