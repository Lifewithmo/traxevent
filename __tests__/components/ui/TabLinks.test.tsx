import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TabLinks, type TabLink } from '@/components/ui/tab-links'

const TABS: TabLink[] = [
  { key: 'all', label: 'Everything', href: '/acme/calendar' },
  { key: 'pipeline', label: 'Pipeline only', href: '/acme/calendar?kinds=pipeline' },
  { key: 'money', label: 'Money', href: '/acme/calendar?kinds=money' },
]

describe('TabLinks', () => {
  it('renders one link per tab, pointed at its href', () => {
    render(<TabLinks tabs={TABS} active="all" ariaLabel="Calendar filter" />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Everything' })).toHaveAttribute('href', '/acme/calendar')
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('href', '/acme/calendar?kinds=pipeline')
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/calendar?kinds=money')
  })

  it('marks only the active tab with aria-current', () => {
    render(<TabLinks tabs={TABS} active="pipeline" ariaLabel="Calendar filter" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Everything' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Money' })).not.toHaveAttribute('aria-current')
  })

  it('names the nav so screen readers can tell two tab groups apart', () => {
    render(<TabLinks tabs={TABS} active="all" ariaLabel="Calendar filter" />)
    expect(screen.getByRole('navigation', { name: 'Calendar filter' })).toBeInTheDocument()
  })

  // CalendarKindFilter relies on this to place the pill (`mx-5 mt-3`); every
  // other consumer will too. Merged, not replacing the pill's own chrome.
  it('merges className onto the nav without dropping its own layout classes', () => {
    render(<TabLinks tabs={TABS} active="all" ariaLabel="Calendar filter" className="mx-5 mt-3" />)
    const nav = screen.getByRole('navigation', { name: 'Calendar filter' })
    expect(nav).toHaveClass('mx-5', 'mt-3')
    expect(nav).toHaveClass('inline-flex', 'border', 'bg-muted')
  })

  it('conveys selection with more than colour', () => {
    render(<TabLinks tabs={TABS} active="pipeline" ariaLabel="Calendar filter" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveClass('font-semibold')
    expect(screen.getByRole('link', { name: 'Everything' })).not.toHaveClass('font-semibold')
  })
})
