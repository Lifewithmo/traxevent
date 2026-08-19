import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProposalPackageOption, ProposalOptionalItems, ProposalTotals } from '@/components/proposals/ProposalPricing'
import type { ProposalPackage } from '@/lib/types'

const legacyPkg: ProposalPackage = {
  id: 'l1',
  name: 'Classic',
  includes: ['One thing', 'Another thing'],
  price: 900,
  recommended: true,
}

describe('ProposalPackageOption', () => {
  it('renders a legacy package from includes + flat price, unchanged', () => {
    render(<ProposalPackageOption pkg={legacyPkg} selected={false} />)
    expect(screen.getByText('Classic')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText('One thing')).toBeInTheDocument()
    expect(screen.getByText('Another thing')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('renders composed bullets instead of includes when provided', () => {
    render(
      <ProposalPackageOption
        pkg={{ ...legacyPkg, includes: ['stale bullet'] }}
        selected={false}
        bullets={['Espresso bar', 'Setup crew']}
      />,
    )
    expect(screen.getByText('Espresso bar')).toBeInTheDocument()
    expect(screen.getByText('Setup crew')).toBeInTheDocument()
    expect(screen.queryByText('stale bullet')).not.toBeInTheDocument()
  })

  it('renders the superset label as the first line when provided', () => {
    render(
      <ProposalPackageOption
        pkg={legacyPkg}
        selected={false}
        bullets={['Extra thing']}
        supersetLabel="Everything in Basic"
      />,
    )
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Everything in Basic')
    expect(rows[1]).toContain('Extra thing')
  })

  it('stays a non-button when no onSelect handler is given (print/locked)', () => {
    render(<ProposalPackageOption pkg={legacyPkg} selected />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })

  it('invokes onSelect only when selectable', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <ProposalPackageOption pkg={legacyPkg} selected={false} selectable onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(1)

    rerender(
      <ProposalPackageOption pkg={legacyPkg} selected={false} selectable={false} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('AA compliance', () => {
  const optional = [{ id: 'o1', description: 'Extra cart', quantity: 1, unit_price: 200, optional: true }]

  it('gives the add-on checkbox row a 44px touch TARGET via the label, not the glyph', () => {
    // WCAG 2.2 AA requires a 24px GLYPH minimum and a 44px TARGET minimum —
    // the target does not have to be the glyph itself. The label already
    // wraps the whole row (min-h-[44px] flex-1), so it supplies the target;
    // the input only needs to be legible at 24px.
    const { container } = render(
      <ProposalOptionalItems items={optional} selectedIds={[]} onToggle={() => {}} />,
    )
    const label = container.querySelector('label')!
    expect(label.className).toContain('min-h-[44px]')
    const box = container.querySelector('input[type="checkbox"]')!
    expect(box.className).toContain('size-6')
  })

  it('does not use gray-400 for the expiry line', () => {
    const { container } = render(
      <ProposalTotals total={{ min: 100, max: 100 }} expiresAt="2026-12-01" />,
    )
    expect(container.innerHTML).not.toContain('text-gray-400')
  })

  it('still states the expiry date', () => {
    render(<ProposalTotals total={{ min: 100, max: 100 }} expiresAt="2026-12-01" />)
    expect(screen.getByText(/expires/i)).toBeInTheDocument()
  })
})
