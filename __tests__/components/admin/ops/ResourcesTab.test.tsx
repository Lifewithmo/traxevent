import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
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
// Priced but unitless: catalog-costing.ts drops this line from every materials
// figure, so the missing unit silently costs money.
const syrup: OpsResource = {
  id: 'r5', name: 'Vanilla syrup', kind: 'consumable', unit_cost: 0.12,
  created_at: '2026-08-01T00:00:00.000Z',
}
const pkg: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 }],
  created_at: '2026-08-01T00:00:00.000Z',
}

// The tab no longer owns the ledger — CatalogClient does, because tabs stay
// mounted and an edit here has to reach the packages tab, the KPI band and the
// health rail without a reload. This stands in for that shell.
function Shell({
  initialResources = [], packages = [], isAdmin = true, showState = false,
}: {
  initialResources?: OpsResource[]
  packages?: WorkPackage[]
  isAdmin?: boolean
  showState?: boolean
}) {
  const [resources, setResources] = useState(initialResources)
  return (
    <>
      <ResourcesTab
        orgId="o1" isAdmin={isAdmin}
        resources={resources} setResources={setResources} packages={packages}
      />
      {showState && (
        <div data-testid="shell-state">
          {resources.map((r) => `${r.name}=${r.unit ?? '-'}@${r.unit_cost ?? '-'}`).join('|')}
        </div>
      )}
    </>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ResourcesTab', () => {
  it('lists resources with kind, unit and cost', () => {
    render(<Shell initialResources={[beans, machine]} packages={[pkg]} />)
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
    expect(screen.getByText('$0.55')).toBeInTheDocument()
    expect(screen.getByText('serialized')).toBeInTheDocument()
  })

  it('creates a resource from the add form', async () => {
    render(<Shell initialResources={[]} packages={[]} />)
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
    render(<Shell initialResources={[beans]} packages={[pkg]} />)
    const btn = screen.getByRole('button', { name: 'Delete Espresso beans' })
    expect(btn).toBeDisabled()
    expect(deleteResource).not.toHaveBeenCalled()
  })

  // Regression guard for a real bypass: `packages` used to be the stale server
  // prop, so a package created in the same session did not protect the
  // resources it referenced — deleting one left a dangling resource_id that
  // breaks re-derive and closeout. With the list lifted, the guard is live.
  it('blocks deleting a resource claimed by a package created in-session', () => {
    const { rerender } = render(<Shell initialResources={[beans]} packages={[]} />)
    expect(screen.getByRole('button', { name: 'Delete Espresso beans' })).toBeEnabled()
    // The shell's package list grows; the tab is never remounted.
    rerender(<Shell initialResources={[beans]} packages={[pkg]} />)
    expect(screen.getByRole('button', { name: 'Delete Espresso beans' })).toBeDisabled()
  })

  // The in-use guard is deliberately an inline row control, not a menu item:
  // a portal-mounted item would hide the very affordance that communicates
  // "you can't do this yet", and would swap the native attribute for
  // aria-disabled (which does not actually block activation).
  it('keeps the in-use guard on the row as a natively disabled button', () => {
    render(<Shell initialResources={[beans]} packages={[pkg]} />)
    const btn = screen.getByRole('button', { name: 'Delete Espresso beans' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('disabled')
    expect(btn).not.toHaveAttribute('aria-disabled')
    expect(btn).toHaveAttribute('title', 'In use by a package — remove it from the package first')
    // ...and it lives in the row, not behind a trigger.
    expect(btn.closest('tr')).not.toBeNull()
  })

  it('hides write controls for non-admins', () => {
    render(<Shell initialResources={[beans]} packages={[]} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: 'Add resource' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit for Espresso beans')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit cost for Espresso beans')).not.toBeInTheDocument()
  })

  it('does not write on blur when the unit cost is unchanged', () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    const input = screen.getByLabelText('Unit cost for Espresso beans')
    fireEvent.blur(input, { target: { value: String(beans.unit_cost) } })
    expect(updateResource).not.toHaveBeenCalled()
  })

  it('clears the unit cost with null when the field is emptied', async () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    fireEvent.blur(screen.getByLabelText('Unit cost for Espresso beans'), { target: { value: '' } })
    await waitFor(() => expect(updateResource).toHaveBeenCalledWith('o1', 'r1', { unit_cost: null }))
  })

  // A cost edit here has to reach the packages tab, the KPI band and the health
  // rail, none of which remount. Proven by the shell's own copy changing.
  it('routes a cost edit up to the shell rather than keeping it local', async () => {
    render(<Shell initialResources={[oatMilk]} packages={[]} showState />)
    fireEvent.blur(screen.getByLabelText('Unit cost for Oat milk'), { target: { value: '0.09' } })
    await waitFor(() => expect(updateResource).toHaveBeenCalledWith('o1', 'r4', { unit_cost: 0.09 }))
    await waitFor(() => expect(screen.getByTestId('shell-state')).toHaveTextContent('Oat milk=oz@0.09'))
  })

  it('edits the unit inline and writes it through', async () => {
    render(<Shell initialResources={[beans]} packages={[]} showState />)
    fireEvent.blur(screen.getByLabelText('Unit for Espresso beans'), { target: { value: 'lb' } })
    await waitFor(() => expect(updateResource).toHaveBeenCalledWith('o1', 'r1', { unit: 'lb' }))
    await waitFor(() => expect(screen.getByTestId('shell-state')).toHaveTextContent('Espresso beans=lb@0.55'))
  })

  it('does not write on blur when the unit is unchanged', () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    fireEvent.blur(screen.getByLabelText('Unit for Espresso beans'), { target: { value: 'oz' } })
    expect(updateResource).not.toHaveBeenCalled()
  })

  // null is the delete sentinel in lib/ops/resources.ts (FieldValue.delete());
  // omitting the key would mean "leave the unit alone".
  it('clears the unit with null when the field is emptied', async () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    fireEvent.blur(screen.getByLabelText('Unit for Espresso beans'), { target: { value: '  ' } })
    await waitFor(() => expect(updateResource).toHaveBeenCalledWith('o1', 'r1', { unit: null }))
  })

  it('cancelling the delete dialog does not delete', async () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso beans' }))
    expect(await screen.findByText('Delete Espresso beans?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteResource).not.toHaveBeenCalled()
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
  })

  it('confirming the delete dialog deletes the resource', async () => {
    render(<Shell initialResources={[beans]} packages={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso beans' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith('o1', 'r1'))
    await waitFor(() => expect(screen.queryByText('Espresso beans')).not.toBeInTheDocument())
  })

  it('tones the kind pill differently per kind', () => {
    render(<Shell initialResources={[beans, cups, machine]} packages={[]} />)
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
    render(<Shell initialResources={[oatMilk, machine]} packages={[]} />)
    // The consumable's blank cost is a real gap — costing uses it.
    expect(screen.getByRole('button', { name: '+ Add cost' })).toBeInTheDocument()
    // The serialized unit's cost never feeds costing; its cost cell (4th) stays an em dash.
    const machineRow = screen.getByText('Espresso Machine 02').closest('tr')!
    const machineCost = machineRow.querySelectorAll('td')[3]
    expect(machineCost.textContent).toContain('—')
    expect(machineCost.textContent).not.toContain('Add cost')
  })

  // Copper is for things you can act on. This used to be an inert span that
  // looked clickable, had no handler, and could not be focused.
  it('makes the add-cost invitation a real focusable button', () => {
    render(<Shell initialResources={[oatMilk]} packages={[]} />)
    const cta = screen.getByRole('button', { name: '+ Add cost' })
    expect(cta.tagName).toBe('BUTTON')
    expect(cta).toBeEnabled()
    fireEvent.click(cta)
    expect(screen.getByLabelText('Unit cost for Oat milk')).toHaveFocus()
  })

  it('names the unitless-but-priced gap and focuses the unit field', () => {
    render(<Shell initialResources={[syrup, beans]} packages={[]} />)
    const cta = screen.getByRole('button', { name: '+ Add unit' })
    expect(cta.tagName).toBe('BUTTON')
    fireEvent.click(cta)
    expect(screen.getByLabelText('Unit for Vanilla syrup')).toHaveFocus()
    // A resource that already has a unit is not nagged.
    expect(screen.getAllByRole('button', { name: '+ Add unit' })).toHaveLength(1)
  })

  it('offers a way in from the empty ledger', () => {
    render(<Shell initialResources={[]} packages={[]} />)
    expect(screen.getByText('No ingredients or equipment yet')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Add your first ingredient' })
    fireEvent.click(cta)
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})
