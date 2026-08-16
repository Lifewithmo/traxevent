import { useMemo, useState } from 'react'
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
// A consumable with no unit_cost: it can never enter the arithmetic, so any
// package using it is costed with a gap — the figure understates.
const milk: OpsResource = {
  id: 'r3', name: 'Whole milk', kind: 'consumable', unit: 'oz',
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
// Beans are costed per oz with no bridge to 'shot', so the only line on this
// package fails conversion: the sum collapses to nothing and the package is
// UNCOSTED with the ingredient named in gaps — not "costed at $0.00".
const shotBar: WorkPackage = {
  id: 'p3', name: 'Shot Bar', price: 700, max_guests: 100,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 2, unit: 'shot' } }],
  created_at: '2026-08-01T00:00:00.000Z',
}
// One priceable line and one that can never be priced: costed, but understated.
const latteBar: WorkPackage = {
  id: 'p4', name: 'Latte Bar', price: 800, max_guests: 100,
  lines: [
    { kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.5 },
    { kind: 'consumable', resource_id: 'r3', qty_per_guest: 2 },
  ],
  created_at: '2026-08-01T00:00:00.000Z',
}

/** Mirrors CatalogClient: packages are lifted state and `costing` is derived from
 *  them, so it is fresh after every create/edit/delete AND stays honest — the
 *  fixtures run through the same pure module the page uses. */
function Harness({
  isAdmin, packages: seed, resources, templates,
}: {
  isAdmin: boolean
  packages: WorkPackage[]
  resources: OpsResource[]
  templates: ChecklistTemplate[]
}) {
  const [packages, setPackages] = useState(seed)
  const costing = useMemo(() => computeCatalogCosting(packages, resources), [packages, resources])
  return (
    <PackagesTab
      orgId="o1"
      isAdmin={isAdmin}
      packages={packages}
      setPackages={setPackages}
      resources={resources}
      templates={templates}
      costing={costing}
    />
  )
}

function renderTab(opts: {
  isAdmin?: boolean
  packages?: WorkPackage[]
  resources?: OpsResource[]
  templates?: ChecklistTemplate[]
} = {}) {
  return render(
    <Harness
      isAdmin={opts.isAdmin ?? true}
      packages={opts.packages ?? []}
      resources={opts.resources ?? []}
      templates={opts.templates ?? []}
    />
  )
}

/** Row actions live behind the kit Menu — open it and pick an item. */
async function rowAction(user: ReturnType<typeof userEvent.setup>, pkgName: string, item: string) {
  await user.click(screen.getByRole('button', { name: `Actions for ${pkgName}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

/** The editor is a Sheet now: open it and wait for the panel. */
async function openEditor(user: ReturnType<typeof userEvent.setup>, pkgName: string) {
  await rowAction(user, pkgName, 'Edit')
  await screen.findByRole('dialog')
}

async function openNewEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'New package' }))
  await screen.findByRole('dialog')
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

  it('renders price and materials as paired figures, never labelled cost or margin', () => {
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    // 0.75 oz/guest × 100 guests × $0.55/oz = $41.25
    expect(screen.getByText('$41.25')).toHaveClass('tabular-nums')
    expect(screen.getByText('$900.00')).toHaveClass('tabular-nums')
    expect(screen.getByText('at 100 guests')).toBeInTheDocument()
    // R2: the rollup is a figure, not a clause inside a muted prose run.
    expect(screen.queryByText(/Materials \$41\.25 · at 100 guests/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not costed')).not.toBeInTheDocument()
    expect(screen.queryByText(/margin/i)).not.toBeInTheDocument()
  })

  it('discloses that the figure excludes equipment as well as labor', () => {
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    expect(screen.getByText(/Excludes labor and equipment\./)).toBeInTheDocument()
  })

  it('renders an em dash, not $0.00, for a package with no capacity to price against', () => {
    renderTab({ packages: [pourOverBar], resources: [beans, machine] })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Not costed')).toBeInTheDocument()
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument()
    // the reason is visible text, not a title attribute on a dead span
    expect(screen.getByText('Set a max guest count to cost this package')).toBeInTheDocument()
  })

  it('names the excluded ingredient when every line on a package fails conversion', () => {
    // Beans are priced per oz with no bridge to 'shot': the only line contributes
    // nothing, so the package is uncosted rather than "costed at $0.00".
    renderTab({ packages: [shotBar], resources: [beans, machine] })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Not costed')).toBeInTheDocument()
    // The regex the old test used stepped around the amount, which is how $0.00
    // escaped review. Assert the amount itself is absent.
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/at 100 guests/)).not.toBeInTheDocument()
    // `gaps` is populated on the uncosted branch too — name what was left out.
    expect(screen.getByText(/Excluded: Espresso beans/)).toBeInTheDocument()
  })

  it('flags a costed package that understates, and names what it excludes', () => {
    renderTab({ packages: [latteBar], resources: [beans, milk] })
    // 0.5 oz/guest × 100 × $0.55 = $27.50; the milk line has no unit_cost at all.
    expect(screen.getByText('$27.50')).toHaveClass('tabular-nums')
    // "{n} not costed" collided with the "Not costed" pill, which means the opposite.
    expect(screen.getByText('1 ingredient excluded')).toBeInTheDocument()
    expect(screen.queryByText('Not costed')).not.toBeInTheDocument()
    expect(screen.getByText(/Excluded: Whole milk — this figure understates/)).toBeInTheDocument()
  })

  it('groups uncosted packages above costed ones', () => {
    renderTab({ packages: [espressoBar, pourOverBar], resources: [beans, machine] })
    const needsCosting = screen.getByText(/Needs costing · 1/)
    const costed = screen.getByText(/Costed · 1/)
    expect(needsCosting.compareDocumentPosition(costed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // …and the uncosted package leads the list despite coming second in the array.
    const uncostedRow = screen.getByText('Pour-Over Bar')
    const costedRow = screen.getByText('Espresso Bar')
    expect(uncostedRow.compareDocumentPosition(costedRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('creates a package with a consumable line and an attached checklist', async () => {
    renderTab({ resources: [beans, machine], templates: [prepTemplate] })
    // exactly one "New package" affordance — the empty state carries it here
    expect(screen.getAllByRole('button', { name: 'New package' })).toHaveLength(1)
    await openNewEditor()
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
    // the created row lands in the ledger, and the standalone affordance replaces
    // the empty state's — still exactly one
    await waitFor(() => expect(screen.getByText('Cold Brew Cart')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: 'New package' })).toHaveLength(1)
  })

  it('lets the operator pick a different compatible unit for a consumable line', async () => {
    renderTab({ resources: [beans, machine] })
    await openNewEditor()
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

  it('opens the editor in a sheet, prefilled, instead of appending a form below the list', async () => {
    const user = userEvent.setup()
    renderTab({ packages: [espressoBar], resources: [beans, machine], templates: [prepTemplate] })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openEditor(user, 'Espresso Bar')
    expect(screen.getByLabelText('Name')).toHaveValue('Espresso Bar')
    expect(screen.getByLabelText('Price ($)')).toHaveValue(900)
    expect(screen.getByLabelText('Max guests')).toHaveValue(100)
    // legacy bare-number quantities are normalised into the unit-aware shape
    expect(screen.getByLabelText('Consumable 1 qty per guest')).toHaveValue(0.75)
    expect(screen.getByLabelText('Consumable 1 unit')).toHaveValue('oz')
    // Line controls are indexed by position in the lines array, not per kind.
    expect(screen.getByLabelText('Equipment 2 qty')).toHaveValue(1)
    expect(screen.getByLabelText('Labor 3 role')).toHaveValue('barista')
    expect(screen.getByLabelText('Labor 3 count')).toHaveValue(2)
  })

  it('clearing max_guests on edit sends null and drops the guests badge', async () => {
    const user = userEvent.setup()
    renderTab({ packages: [espressoBar], resources: [beans, machine] })
    expect(screen.getByText(/up to 100 guests/)).toBeInTheDocument()
    await openEditor(user, 'Espresso Bar')
    fireEvent.change(screen.getByLabelText('Max guests'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(updateWorkPackage).toHaveBeenCalledWith('o1', 'p1', expect.objectContaining({ max_guests: null }))
    )
    await waitFor(() => expect(screen.queryByText(/up to 100 guests/)).not.toBeInTheDocument())
  })

  it('disables Save until every consumable line has a resource and a positive qty per guest', async () => {
    renderTab({ resources: [beans, machine] })
    await openNewEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cold Brew Cart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    expect(screen.getByRole('button', { name: 'Save package' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    expect(screen.getByRole('button', { name: 'Save package' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.5' } })
    expect(screen.getByRole('button', { name: 'Save package' })).not.toBeDisabled()
  })
})
