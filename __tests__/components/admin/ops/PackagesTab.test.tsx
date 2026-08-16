import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/work-packages', () => ({
  createWorkPackage: vi.fn().mockImplementation(async (_orgId: string, input: object) => ({
    id: 'p-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  updateWorkPackage: vi.fn().mockResolvedValue(undefined),
  deleteWorkPackage: vi.fn().mockResolvedValue(undefined),
}))

import { createWorkPackage, updateWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import { computeCatalogCosting } from '@/lib/ops/catalog-costing'
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
// No max_guests => nothing to price against, so the catalog reports it uncosted.
const pourOverBar: WorkPackage = {
  id: 'p2', name: 'Pour-Over Bar', price: 450,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.5 }],
  created_at: '2026-08-01T00:00:00.000Z',
}
// Beans are costed per oz with no bridge to 'shot' — costed:true, materials 0,
// gaps ['Espresso beans'] (mirrors __tests__/lib/ops/catalog-costing.test.ts).
const shotBar: WorkPackage = {
  id: 'p3', name: 'Shot Bar', price: 700, max_guests: 100,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 2, unit: 'shot' } }],
  created_at: '2026-08-01T00:00:00.000Z',
}

// Costing is a prop, but it stays honest here: the fixtures run through the same
// pure module the page uses, so a change in costing rules shows up in these tests.
function renderTab(opts: {
  isAdmin?: boolean
  packages?: WorkPackage[]
  resources?: OpsResource[]
  templates?: ChecklistTemplate[]
} = {}) {
  const packages = opts.packages ?? []
  const resources = opts.resources ?? []
  return render(
    <PackagesTab
      orgId="o1"
      isAdmin={opts.isAdmin ?? true}
      packages={packages}
      resources={resources}
      templates={opts.templates ?? []}
      costing={computeCatalogCosting(packages, resources)}
    />
  )
}

/** Row actions moved behind the kit Menu — open it and pick an item. */
async function rowAction(user: ReturnType<typeof userEvent.setup>, pkgName: string, item: string) {
  await user.click(screen.getByRole('button', { name: `Actions for ${pkgName}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

beforeEach(() => vi.clearAllMocks())

describe('PackagesTab', () => {
  it('lists packages with price and line summary', () => {
    renderTab({ packages: [espressoBar], resources: [beans, machine], templates: [prepTemplate] })
    expect(screen.getByText('Espresso Bar')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText(/0\.75 oz × guests/)).toBeInTheDocument()
    expect(screen.getByText(/barista × 2/)).toBeInTheDocument()
  })

  it('shows the materials figure with its guest basis, never labelled cost or margin', () => {
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    // 0.75 oz/guest × 100 guests × $0.55/oz = $41.25
    expect(screen.getByText('Materials $41.25 · at 100 guests · excludes labor')).toBeInTheDocument()
    expect(screen.queryByText('Not costed')).not.toBeInTheDocument()
    expect(screen.queryByText(/margin/i)).not.toBeInTheDocument()
  })

  it('renders an em dash, not $0.00, for a package with no capacity to price against', () => {
    renderTab({ packages: [pourOverBar], resources: [beans, machine] })
    expect(screen.getByText('Materials —')).toBeInTheDocument()
    expect(screen.getByText('Not costed')).toBeInTheDocument()
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument()
    // the rail names it too, with the operator-facing reason
    expect(screen.getByText('Set a max guest count to cost this package')).toBeInTheDocument()
  })

  it('flags a costed package whose ingredient has no conversion path, so the figure is not read as cheap', () => {
    renderTab({ packages: [shotBar], resources: [beans, machine] })
    expect(screen.getByText(/at 100 guests · excludes labor/)).toBeInTheDocument()
    expect(screen.getByText('1 not costed')).toBeInTheDocument()
    expect(screen.getByTitle(/Espresso beans/)).toBeInTheDocument()
  })

  it('creates a package with a consumable line and an attached checklist', async () => {
    renderTab({ resources: [beans, machine], templates: [prepTemplate] })
    // exactly one "New package" affordance — the empty state carries it here
    expect(screen.getAllByRole('button', { name: 'New package' })).toHaveLength(1)
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
    renderTab({ resources: [beans, machine] })
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

  it('warns before deleting a package and deletes nothing on cancel', async () => {
    const user = userEvent.setup()
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    await rowAction(user, 'Espresso Bar', 'Delete')
    expect(await screen.findByText(/events already set up with it will fail/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteWorkPackage).not.toHaveBeenCalled()
  })

  it('deletes the package once the warning is confirmed', async () => {
    const user = userEvent.setup()
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    await rowAction(user, 'Espresso Bar', 'Delete')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteWorkPackage).toHaveBeenCalledWith('o1', 'p1'))
    await waitFor(() => expect(screen.queryByText('$900.00')).not.toBeInTheDocument())
  })

  it('hides write controls for non-admins', () => {
    renderTab({ isAdmin: false, packages: [espressoBar] })
    expect(screen.queryByRole('button', { name: 'New package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions for Espresso Bar' })).not.toBeInTheDocument()
  })

  it('clearing max_guests on edit sends null and drops the guests badge', async () => {
    const user = userEvent.setup()
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    expect(screen.getByText(/up to 100 guests/)).toBeInTheDocument()
    await rowAction(user, 'Espresso Bar', 'Edit')
    fireEvent.change(screen.getByLabelText('Max guests'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(updateWorkPackage).toHaveBeenCalledWith('o1', 'p1', expect.objectContaining({ max_guests: null }))
    )
    expect(screen.queryByText(/up to 100 guests/)).not.toBeInTheDocument()
  })

  it('disables Save until every consumable line has a resource and a positive qty per guest', () => {
    renderTab({ resources: [beans, machine] })
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
