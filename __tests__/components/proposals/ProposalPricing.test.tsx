import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { ProposalPackageOption, ProposalTotals } from '@/components/proposals/ProposalPricing'
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

// This component SSRs on the print route and SSRs-then-hydrates inside the
// public page's sticky footer, so its expiry line must be byte-identical on
// any runtime, in any zone (the /checkin hydration-crash class — a divergence
// here left the Sign & accept button dead).
describe('ProposalTotals — zone-safe expiry line', () => {
  const total = { min: 1000, max: 1000 }

  it('renders a date-only expires_at as its own calendar day (the guards still honor the full day)', () => {
    const html = renderToString(<ProposalTotals total={total} expiresAt="2026-08-30" />)
    // The old rendering pushed the string through end-of-day-UTC + a
    // zone-following toLocaleDateString — "8/31/2026" for anyone east of UTC.
    expect(html.replace(/<!-- -->/g, '')).toContain('This proposal expires Aug 30, 2026')
  })

  it('renders an ISO-instant expires_at pinned to UTC and labeled', () => {
    const html = renderToString(
      <ProposalTotals total={total} expiresAt="2026-08-30T23:30:00.000Z" />,
    )
    expect(html.replace(/<!-- -->/g, '')).toContain(
      'This proposal expires Aug 30, 2026, 11:30 PM UTC',
    )
  })

  it('omits the expiry line entirely for an unparseable expires_at', () => {
    render(<ProposalTotals total={total} expiresAt="not-a-real-date" />)
    expect(screen.queryByText(/This proposal expires/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })
})
