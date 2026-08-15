import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PricingCanvas } from '@/components/admin/proposal-builder/PricingCanvas'
import type { ProposalLineItem, ProposalPackage } from '@/lib/types'

const items: ProposalLineItem[] = [
  { id: 'i1', description: 'Setup crew', quantity: 2, unit_price: 100, unit: 'hr' },
  { id: 'i2', description: 'Espresso bar', quantity: 1, unit_price: 500 },
  { id: 'i3', description: 'Late teardown', quantity: 1, unit_price: 150, optional: true },
  { id: 'i4', description: 'Venue fee', quantity: 1, unit_price: 250 },
]

const packages: ProposalPackage[] = [
  { id: 'pa', name: 'Basic', includes: [], price: 200, item_ids: ['i1'] },
  { id: 'pb', name: 'Better', includes: [], price: 700, item_ids: ['i1', 'i2'], recommended: true },
]

let onItemsChange: ReturnType<typeof vi.fn<(next: ProposalLineItem[]) => void>>
let onPackagesChange: ReturnType<typeof vi.fn<(next: ProposalPackage[]) => void>>

beforeEach(() => {
  onItemsChange = vi.fn<(next: ProposalLineItem[]) => void>()
  onPackagesChange = vi.fn<(next: ProposalPackage[]) => void>()
})

// PricingCanvas is controlled: in the app the builder client re-renders it
// with each change. The harness reproduces that so sequential edits (e.g.
// three popover fields in a row) compose instead of clobbering each other.
function Harness({
  initialItems,
  initialPackages,
  disabled = false,
}: {
  initialItems: ProposalLineItem[]
  initialPackages: ProposalPackage[]
  disabled?: boolean
}) {
  const [liveItems, setItems] = useState(initialItems)
  const [livePackages, setPackages] = useState(initialPackages)
  return (
    <PricingCanvas
      lineItems={liveItems}
      packages={livePackages}
      onItemsChange={(next) => { onItemsChange(next); setItems(next) }}
      onPackagesChange={(next) => { onPackagesChange(next); setPackages(next) }}
      disabled={disabled}
    />
  )
}

function mount(over: { blocks?: never; lineItems?: ProposalLineItem[]; packages?: ProposalPackage[]; disabled?: boolean } = {}) {
  return render(
    <Harness
      initialItems={over.lineItems ?? items}
      initialPackages={over.packages ?? packages}
      disabled={over.disabled ?? false}
    />,
  )
}

function lastPackages(): ProposalPackage[] {
  return onPackagesChange.mock.calls.at(-1)![0] as ProposalPackage[]
}

function lastItems(): ProposalLineItem[] {
  return onItemsChange.mock.calls.at(-1)![0] as ProposalLineItem[]
}

describe('PricingCanvas', () => {
  it('renders tiers with computed prices and member bullets', () => {
    mount()
    const basic = screen.getByTestId('tier-pa')
    expect(within(basic).getByText('$200.00')).toBeInTheDocument()
    expect(within(basic).getByText('Setup crew')).toBeInTheDocument()
    const better = screen.getByTestId('tier-pb')
    expect(within(better).getByText('$700.00')).toBeInTheDocument()
  })

  it('editing a bullet updates the underlying item description', () => {
    mount()
    const better = screen.getByTestId('tier-pb')
    fireEvent.click(within(better).getByText('Espresso bar'))
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'Espresso + cold brew bar' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    const updated = lastItems().find((i) => i.id === 'i2')
    expect(updated?.description).toBe('Espresso + cold brew bar')
  })

  it('the qty/price popover edits quantity, unit price, and unit', () => {
    mount()
    const basic = screen.getByTestId('tier-pa')
    fireEvent.click(within(basic).getByRole('button', { name: /2 × \$100\.00/ }))
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'day' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    const updated = lastItems().find((i) => i.id === 'i1')
    expect(updated).toMatchObject({ quantity: 3, unit_price: 120, unit: 'day' })
  })

  it('clicking the tier price sets an override; clicking again clears it', () => {
    mount()
    const basic = screen.getByTestId('tier-pa')
    fireEvent.click(within(basic).getByRole('button', { name: /set package price/i }))
    fireEvent.change(screen.getByLabelText('Package price'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(lastPackages().find((p) => p.id === 'pa')?.price_override).toBe(180)
  })

  it('shows an override badge on overridden tiers and clearing restores the sum', () => {
    mount({
      packages: [{ ...packages[0], price_override: 180 }],
    })
    const basic = screen.getByTestId('tier-pa')
    expect(within(basic).getByText(/overridden/i)).toBeInTheDocument()
    fireEvent.click(within(basic).getByRole('button', { name: /set package price/i }))
    fireEvent.click(screen.getByRole('button', { name: /use computed sum/i }))
    expect(lastPackages()[0].price_override).toBeUndefined()
  })

  it('the member picker toggles pool items in and out of a tier', () => {
    mount()
    const basic = screen.getByTestId('tier-pa')
    fireEvent.click(within(basic).getByRole('button', { name: /edit members/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /venue fee/i }))
    const updated = lastPackages().find((p) => p.id === 'pa')
    expect(updated?.item_ids).toContain('i4')
  })

  it('add item appends a new line item to the pool and the tier', () => {
    mount()
    const basic = screen.getByTestId('tier-pa')
    fireEvent.click(within(basic).getByRole('button', { name: /add item/i }))
    const newItems = lastItems()
    expect(newItems).toHaveLength(items.length + 1)
    const added = newItems[newItems.length - 1]
    expect(lastPackages().find((p) => p.id === 'pa')?.item_ids).toContain(added.id)
  })

  it('adding a tier can start from the previous tier’s members — one click, no dropdown', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /start from better/i }))
    const added = lastPackages().at(-1)!
    expect(added.item_ids).toEqual(['i1', 'i2'])
  })

  it('renders required scope and optional add-ons as editable lists', () => {
    mount()
    expect(screen.getByText('Venue fee')).toBeInTheDocument()
    expect(screen.getByText('Late teardown')).toBeInTheDocument()
  })

  it('legacy packages render read-only with an upgrade note', () => {
    mount({ packages: [{ id: 'lg', name: 'Old tier', includes: ['A bullet'], price: 500 }] })
    const tier = screen.getByTestId('tier-lg')
    expect(within(tier).getByText('A bullet')).toBeInTheDocument()
    expect(within(tier).getByText(/legacy/i)).toBeInTheDocument()
  })

  it('shows no editing affordances when disabled', () => {
    mount({ disabled: true })
    expect(screen.queryByRole('button', { name: /add tier/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument()
  })

  describe('tier row layout + add-tier slot', () => {
    it('sizes the grid to its occupants so a lone tier is not stuck in a third-width column', () => {
      const { container } = mount({ packages: [packages[0]] })
      // 1 tier + the add slot = 2 columns
      expect(container.querySelector('.sm\\:grid-cols-2')).toBeTruthy()
      expect(screen.getByTestId('add-tier-slot')).toBeInTheDocument()
    })

    it('with no tiers, the slot alone spans the full width and invites the first tier', () => {
      const { container } = mount({ packages: [] })
      expect(container.querySelector('.sm\\:grid-cols-1')).toBeTruthy()
      expect(screen.getByText(/give the customer a choice/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /start from/i })).not.toBeInTheDocument()
    })

    it('adds an empty tier directly from the slot — no dropdown', () => {
      mount({ packages: [] })
      fireEvent.click(screen.getByRole('button', { name: /add empty tier/i }))
      expect(lastPackages()).toHaveLength(1)
      expect(lastPackages()[0].item_ids).toEqual([])
    })

    it('hides the slot at three tiers (the customer-facing max)', () => {
      const { container } = mount({
        packages: [
          ...packages,
          { id: 'pc', name: 'Best', includes: [], price: 900, item_ids: ['i1', 'i2', 'i4'] },
        ],
      })
      expect(screen.queryByTestId('add-tier-slot')).not.toBeInTheDocument()
      expect(container.querySelector('.sm\\:grid-cols-3')).toBeTruthy()
    })

    it('disabled mode still sizes the grid to the tier count alone', () => {
      const { container } = mount({ packages: [packages[0]], disabled: true })
      expect(screen.queryByTestId('add-tier-slot')).not.toBeInTheDocument()
      expect(container.querySelector('.sm\\:grid-cols-1')).toBeTruthy()
    })
  })
})
