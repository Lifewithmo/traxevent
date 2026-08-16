import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The three tabs are owned by other components and pull in server actions; mock
// them so these assertions isolate the shell (header, KPI band, tab wiring).
// ResourcesTab is stateful on purpose — it is how the keepMounted test proves
// that switching tabs preserves React state, not just DOM nodes.
vi.mock('@/components/admin/ops/PackagesTab', () => ({
  PackagesTab: ({ costing }: { costing: unknown[] }) => (
    <div>packages tab · {costing.length} costed</div>
  ),
}))
vi.mock('@/components/admin/ops/ResourcesTab', () => ({
  ResourcesTab: () => {
    const [draft, setDraft] = useState('')
    return (
      <div>
        <label htmlFor="draft">Resource draft</label>
        <input id="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </div>
    )
  },
}))
vi.mock('@/components/admin/ops/ChecklistTemplatesTab', () => ({
  ChecklistTemplatesTab: () => <div>checklists tab</div>,
}))

import { CatalogClient } from '@/components/admin/ops/CatalogClient'
import { computeCatalogCosting } from '@/lib/ops/catalog-costing'
import type { OpsResource, WorkPackage } from '@/lib/types'

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

function renderCatalog(over: {
  title?: string
  packages?: WorkPackage[]
  resources?: OpsResource[]
} = {}) {
  const packages = over.packages ?? [espressoBar, coldBrew]
  const resources = over.resources ?? [beans, cups, machine]
  return render(
    <CatalogClient
      orgId="o1"
      isAdmin
      title={over.title ?? 'Menu Packages'}
      packages={packages}
      resources={resources}
      templates={[]}
      ownTemplateIds={[]}
      costing={computeCatalogCosting(packages, resources)}
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
      expect(tile('Price range')).toHaveTextContent('$600.00–$900.00')
      expect(tile('Ingredients & equipment')).toHaveTextContent('3')
      expect(tile('Uncosted ingredients')).toHaveTextContent('1')
      expect(tile('Uncosted ingredients')).toHaveTextContent('blocks materials cost')
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
      expect(tile('Price range')).not.toHaveTextContent('$0.00')
    })

    it('collapses the price range to one figure when every package is the same price', () => {
      renderCatalog({ packages: [espressoBar, { ...coldBrew, price: 900 }] })
      expect(tile('Price range').textContent).toContain('$900.00')
      expect(tile('Price range').textContent).not.toContain('–')
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

  it('passes computed costing through to the packages tab', () => {
    renderCatalog()
    expect(screen.getByText(/packages tab · 2 costed/)).toBeInTheDocument()
  })
})
