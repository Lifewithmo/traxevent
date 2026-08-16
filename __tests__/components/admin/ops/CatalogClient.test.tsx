import { describe, it, expect, vi } from 'vitest'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OpsResource, WorkPackage } from '@/lib/types'

// The three tabs are owned by other components and pull in server actions; mock
// them so these assertions isolate the shell (header, KPI band, rail, tab wiring).
//
// Two mocks are deliberately more than placeholders:
//   - PackagesTab calls its injected `setPackages`, and ResourcesTab its
//     `setResources`. Since the shell owns the datasets, that is the only way to
//     prove an in-session mutation reaches the band, the rail and the subhead —
//     the regression guard for the stale-props bug.
//   - ResourcesTab also holds a local draft, which is how the keepMounted test
//     proves switching tabs preserves React state, not just DOM nodes.
vi.mock('@/components/admin/ops/PackagesTab', () => ({
  PackagesTab: ({
    packages,
    setPackages,
    costing,
  }: {
    packages: WorkPackage[]
    setPackages: Dispatch<SetStateAction<WorkPackage[]>>
    costing: unknown[]
  }) => (
    <div>
      <span>
        packages tab · {packages.length} rows · {costing.length} costed
      </span>
      {/* A package with no consumable lines is uncosted by construction, and it
          is priced high enough to force thousands grouping in the band. */}
      <button
        type="button"
        onClick={() =>
          setPackages((prev) => [
            ...prev,
            {
              id: 'p3',
              name: 'Barista Cart',
              price: 4200,
              max_guests: 50,
              lines: [],
              created_at: '2026-08-01T00:00:00.000Z',
            },
          ])
        }
      >
        create package
      </button>
    </div>
  ),
}))
vi.mock('@/components/admin/ops/ResourcesTab', () => ({
  ResourcesTab: ({
    resources,
    setResources,
  }: {
    resources: OpsResource[]
    setResources: Dispatch<SetStateAction<OpsResource[]>>
  }) => {
    const [draft, setDraft] = useState('')
    return (
      <div>
        <span>resources tab · {resources.length} rows</span>
        <label htmlFor="draft">Resource draft</label>
        <input id="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button
          type="button"
          onClick={() =>
            setResources((prev) =>
              prev.map((r) => (r.id === 'r2' ? { ...r, unit_cost: 0.25 } : r))
            )
          }
        >
          cost cups
        </button>
      </div>
    )
  },
}))
vi.mock('@/components/admin/ops/ChecklistTemplatesTab', () => ({
  ChecklistTemplatesTab: () => <div>checklists tab</div>,
}))

import { CatalogClient } from '@/components/admin/ops/CatalogClient'

const AT = '2026-08-01T00:00:00.000Z'

const beans: OpsResource = { id: 'r1', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55, created_at: AT }
const cups: OpsResource = { id: 'r2', name: 'Cups', kind: 'consumable', unit: 'each', created_at: AT }
const machine: OpsResource = { id: 'r3', name: 'Espresso Machine 02', kind: 'serialized', created_at: AT }

const espressoBar: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900, max_guests: 100,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 }],
  created_at: AT,
}
const coldBrew: WorkPackage = {
  id: 'p2', name: 'Cold Brew Cart', price: 600, max_guests: 80,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.5 }],
  created_at: AT,
}
// No consumable lines => computeCatalogCosting returns costed:false.
const dryHire: WorkPackage = {
  id: 'p9', name: 'Dry Hire', price: 150, max_guests: 40, lines: [], created_at: AT,
}

function renderCatalog(over: {
  title?: string
  packages?: WorkPackage[]
  resources?: OpsResource[]
} = {}) {
  return render(
    <CatalogClient
      orgId="o1"
      isAdmin
      title={over.title ?? 'Menu Packages'}
      packages={over.packages ?? [espressoBar, coldBrew]}
      resources={over.resources ?? [beans, cups, machine]}
      templates={[]}
      ownTemplateIds={[]}
    />
  )
}

// Scoped to the band: the `title` prop is deliberately reused as the h1, the
// first tile's label, and the first tab's label, so an unscoped getByText for
// it matches three nodes.
function tile(label: string): HTMLElement {
  const band = document.querySelector('[data-slot="kpi-band"]')
  if (!band) throw new Error('no kpi band rendered')
  const el = within(band as HTMLElement).getByText(label).closest('[data-slot="stat-tile"]')
  if (!el) throw new Error(`no stat tile for label "${label}"`)
  return el as HTMLElement
}

// The tabs are mocked, so every RelatedRecordCard on screen belongs to the rail.
function railCards(): NodeListOf<Element> {
  return document.querySelectorAll('[data-slot="related-record-card"]')
}

describe('CatalogClient', () => {
  describe('header', () => {
    it('renders the industry-pack title verbatim, never a hardcoded "Packages"', () => {
      renderCatalog({ title: 'Rental Packages' })
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('Rental Packages')
      // The sidebar derives its label from the same catalogLabel() call —
      // hardcoding "Packages" here would desync nav from the page.
      expect(h1.textContent).not.toBe('Packages')
      expect(screen.queryByRole('heading', { level: 1, name: 'Packages' })).toBeNull()
    })

    it('summarises the catalog size in the subhead', () => {
      renderCatalog()
      expect(screen.getByText(/2 packages · 3 ingredients & equipment/)).toBeInTheDocument()
    })

    it('pluralises the subhead counts for a single package and resource', () => {
      renderCatalog({ packages: [espressoBar], resources: [beans] })
      expect(screen.getByText(/1 package · 1 ingredient or equipment item/)).toBeInTheDocument()
    })
  })

  describe('KPI band', () => {
    it('renders all four tiles with their labels and values', () => {
      renderCatalog({ title: 'Menu Packages' })
      expect(tile('Menu Packages')).toHaveTextContent('2')
      expect(tile('Price range')).toHaveTextContent('$600–$900')
      expect(tile('Not costed')).toHaveTextContent('0')
      expect(tile('Not costed')).toHaveTextContent('no materials figure')
      expect(tile('Uncosted ingredients')).toHaveTextContent('1')
      expect(tile('Uncosted ingredients')).toHaveTextContent('blocks the materials figure')
    })

    it('drops the ingredient count tile — the subhead already carries it', () => {
      renderCatalog()
      const band = document.querySelector('[data-slot="kpi-band"]') as HTMLElement
      expect(within(band).queryByText('Ingredients & equipment')).toBeNull()
      expect(band.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(4)
    })

    it('never says "cost" for the materials figure in a tile note', () => {
      renderCatalog()
      expect(tile('Uncosted ingredients')).not.toHaveTextContent('blocks materials cost')
    })

    it('counts packages with no materials figure in the Not costed tile, with the alert tone', () => {
      renderCatalog({ packages: [espressoBar, dryHire] })
      const notCosted = tile('Not costed')
      expect(notCosted).toHaveTextContent('1')
      expect(notCosted.querySelector('.text-destructive')).not.toBeNull()
    })

    it('drops the Not costed alert tone when every package has a materials figure', () => {
      renderCatalog()
      const notCosted = tile('Not costed')
      expect(notCosted).toHaveTextContent('0')
      expect(notCosted.querySelector('.text-destructive')).toBeNull()
    })

    it('groups thousands in the price range instead of rendering raw two-decimal money', () => {
      renderCatalog({ packages: [dryHire, { ...coldBrew, price: 4200 }] })
      const range = tile('Price range')
      expect(range).toHaveTextContent('$150–$4,200')
      expect(range).not.toHaveTextContent('$4200')
      expect(range).not.toHaveTextContent('.00')
    })

    it('flags uncosted ingredients with the alert tone', () => {
      renderCatalog({ resources: [beans, cups, machine] })
      // `cups` is a consumable with no unit_cost — it blocks materials costing.
      const uncosted = tile('Uncosted ingredients')
      expect(uncosted).toHaveTextContent('1')
      expect(uncosted.querySelector('.text-destructive')).not.toBeNull()
    })

    it('drops the alert tone when every consumable is costed', () => {
      renderCatalog({ resources: [beans, machine] })
      const uncosted = tile('Uncosted ingredients')
      expect(uncosted).toHaveTextContent('0')
      expect(uncosted.querySelector('.text-destructive')).toBeNull()
    })

    it('renders an em dash for the price range of an empty catalog', () => {
      renderCatalog({ packages: [] })
      expect(tile('Price range')).toHaveTextContent('—')
      expect(tile('Price range')).not.toHaveTextContent('$0')
    })

    it('collapses the price range to one figure when every package is the same price', () => {
      renderCatalog({ packages: [espressoBar, { ...coldBrew, price: 900 }] })
      expect(tile('Price range').textContent).toContain('$900')
      expect(tile('Price range').textContent).not.toContain('–')
    })
  })

  // The shell owns packages/resources/templates so every surface reads one copy.
  // Before this, each tab seeded its own useState from a server prop and
  // `keepMounted` guaranteed it never remounted, so an in-session write was
  // invisible everywhere else until a full page reload.
  describe('shared catalog state', () => {
    it('updates the band, subhead and rail when a tab creates a package', async () => {
      const user = userEvent.setup()
      renderCatalog()
      expect(tile('Menu Packages')).toHaveTextContent('2')
      expect(tile('Not costed')).toHaveTextContent('0')

      await user.click(screen.getByRole('button', { name: 'create package' }))

      expect(tile('Menu Packages')).toHaveTextContent('3')
      expect(tile('Price range')).toHaveTextContent('$600–$4,200')
      expect(tile('Not costed')).toHaveTextContent('1')
      expect(screen.getByText(/3 packages · 3 ingredients & equipment/)).toBeInTheDocument()
      // The rail re-derives too: the new package lands in "Not yet costed".
      expect(screen.getByText('Barista Cart')).toBeInTheDocument()
    })

    it('re-derives costing for the packages tab when the resources tab costs an ingredient', async () => {
      const user = userEvent.setup()
      renderCatalog()
      expect(tile('Uncosted ingredients')).toHaveTextContent('1')

      await user.click(screen.getByRole('tab', { name: 'Ingredients & Equipment' }))
      await user.click(screen.getByRole('button', { name: 'cost cups' }))

      expect(tile('Uncosted ingredients')).toHaveTextContent('0')
      // Sibling tab sees the same array — the cross-tab staleness this fixes.
      expect(screen.getByText(/packages tab · 2 rows · 2 costed/)).toBeInTheDocument()
    })

    it('hands every tab the same package list', async () => {
      const user = userEvent.setup()
      renderCatalog()
      await user.click(screen.getByRole('button', { name: 'create package' }))
      expect(screen.getByText(/packages tab · 3 rows/)).toBeInTheDocument()
    })
  })

  describe('health rail', () => {
    it('is a sibling of the tab set, not of one panel, so it caps every tab', () => {
      renderCatalog()
      const rail = document.querySelector('aside')
      expect(rail).not.toBeNull()
      // Inside a TabsPanel it only capped the packages tab, leaving the other
      // two stretched to the full page width.
      expect(rail!.closest('[data-slot="tabs-panel"]')).toBeNull()
      expect(rail!.className).toContain('lg:w-72')
    })

    it('is hidden entirely on a brand-new catalog with no packages and no resources', () => {
      renderCatalog({ packages: [], resources: [] })
      // "Every ingredient is costed" beside "No packages yet" is vacuously true
      // and actively misleading — same guard VendorsLedger applies to its band.
      expect(railCards()).toHaveLength(0)
      expect(screen.queryByText('Every ingredient is costed')).toBeNull()
      expect(screen.queryByText('Every package has a materials figure')).toBeNull()
    })

    it('appears once there are resources but no packages yet', () => {
      renderCatalog({ packages: [], resources: [beans] })
      expect(railCards()).toHaveLength(2)
    })

    it('appears once there are packages but no resources yet', () => {
      renderCatalog({ packages: [espressoBar], resources: [] })
      expect(railCards()).toHaveLength(2)
    })
  })

  describe('tabs', () => {
    it('exposes tablist/tab/aria-selected semantics with the packages tab default', () => {
      renderCatalog({ title: 'Menu Packages' })
      expect(screen.getByRole('tablist')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Menu Packages' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Ingredients & Equipment' })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: 'Checklists' })).toHaveAttribute('aria-selected', 'false')
    })

    it('wires each tab to its panel via aria-controls', () => {
      renderCatalog({ title: 'Menu Packages' })
      const checklistsTab = screen.getByRole('tab', { name: 'Checklists' })
      const panelId = checklistsTab.getAttribute('aria-controls')
      expect(panelId).toBeTruthy()
      const panel = document.getElementById(panelId!)
      expect(panel).toHaveAttribute('role', 'tabpanel')
      expect(panel).toHaveTextContent('checklists tab')
    })

    it('reveals the checklists panel when its tab is clicked', async () => {
      const user = userEvent.setup()
      renderCatalog()
      expect(screen.getByText('checklists tab')).not.toBeVisible()

      await user.click(screen.getByRole('tab', { name: 'Checklists' }))

      expect(screen.getByRole('tab', { name: 'Checklists' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('checklists tab')).toBeVisible()
      expect(screen.getByText(/packages tab/)).not.toBeVisible()
    })

    it('keeps inactive panel content mounted in the DOM', async () => {
      const user = userEvent.setup()
      renderCatalog()
      await user.click(screen.getByRole('tab', { name: 'Checklists' }))

      // All three panels stay in the DOM (hidden, not unmounted).
      expect(screen.getByText(/packages tab/)).toBeInTheDocument()
      expect(screen.getByLabelText('Resource draft')).toBeInTheDocument()
      expect(screen.getByText('checklists tab')).toBeInTheDocument()
    })

    it('preserves in-progress child state across tab switches', async () => {
      const user = userEvent.setup()
      renderCatalog()

      await user.click(screen.getByRole('tab', { name: 'Ingredients & Equipment' }))
      const draft = screen.getByLabelText('Resource draft') as HTMLInputElement
      await user.type(draft, 'Oat milk')
      expect(draft.value).toBe('Oat milk')

      await user.click(screen.getByRole('tab', { name: 'Checklists' }))
      await user.click(screen.getByRole('tab', { name: 'Ingredients & Equipment' }))

      // The mock seeds its useState from '' — a remount would blank this out.
      expect((screen.getByLabelText('Resource draft') as HTMLInputElement).value).toBe('Oat milk')
    })
  })

  it('derives costing in the shell and passes it to the packages tab', () => {
    renderCatalog()
    expect(screen.getByText(/packages tab · 2 rows · 2 costed/)).toBeInTheDocument()
  })
})
