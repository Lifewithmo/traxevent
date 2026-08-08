import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProposalPackageOption } from '@/components/proposals/ProposalPricing'
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
