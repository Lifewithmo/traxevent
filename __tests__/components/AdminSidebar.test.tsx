import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/auth/establish-session', () => ({ endSession: vi.fn() }))

import { AdminSidebar } from '@/components/layout/AdminSidebar'

describe('AdminSidebar workspace nav gating', () => {
  it('shows every workspace link when enabledModules is omitted', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Registrants')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('hides links whose module is not enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads', 'invoices', 'calendar']} />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()   // leads
    expect(screen.queryByText('Registrants')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument() // no catalog modules

    fireEvent.click(screen.getByRole('button', { name: /expand pipeline/i }))
    expect(screen.queryByText('Proposals')).not.toBeInTheDocument() // module off

    fireEvent.click(screen.getByRole('button', { name: /expand money/i }))
    expect(screen.getByText('Invoices')).toBeInTheDocument()   // invoices
  })

  it('hides a section entirely when none of its links are enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Money holds Invoices and Reports; with both modules off the section is gone.
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })

  it('always shows the Settings block regardless of modules', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Settings panel is collapsed by default on non-settings routes; expand it.
    fireEvent.click(screen.getByRole('button', { name: /expand settings/i }))
    expect(screen.getByText('Members')).toBeInTheDocument()
  })
})

describe('AdminSidebar event nav roster gating', () => {
  it('hides roster event-nav items when attendee-roster module is off', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="e1" enabledModules={['events', 'reports', 'calendar']} />)
    expect(screen.queryByText('Families')).not.toBeInTheDocument()
    expect(screen.queryByText('Check-in')).not.toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument() // non-roster stays
  })

  it('shows roster event-nav items when attendee-roster is enabled', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="e1" enabledModules={['events', 'attendee-roster']} />)
    expect(screen.getByText('Check-in')).toBeInTheDocument()
  })
})

describe('Catalog nav (phase 3)', () => {
  it('shows catalog + compliance links when modules enabled', () => {
    render(
      <AdminSidebar
        orgSlug="acme"
        enabledModules={['catalog', 'compliance']}
        catalogLabel="Menu Packages"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByRole('link', { name: 'Menu Packages' })).toHaveAttribute('href', '/acme/packages')
    expect(screen.getByRole('link', { name: 'Compliance' })).toHaveAttribute('href', '/acme/compliance')
  })

  it('hides the Catalog section when neither module is enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument()
  })

  it('falls back to the universal catalog label', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['catalog']} />)
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByRole('link', { name: 'Packages' })).toHaveAttribute('href', '/acme/packages')
  })

  it('shows Event Ops in the event nav when the ops page is allowed', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="gala" allowedEventPages={['ops']} />)
    expect(screen.getByRole('link', { name: 'Event Ops' })).toHaveAttribute('href', '/acme/gala/ops')
  })

  it('hides Event Ops when the member lacks the ops grant', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="gala" allowedEventPages={['itinerary']} />)
    expect(screen.queryByText('Event Ops')).not.toBeInTheDocument()
  })

  it('applies print:hidden class to the sidebar', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const sidebar = document.querySelector('aside')
    expect(sidebar).toHaveClass('print:hidden')
  })
})

describe('AdminSidebar Today nav', () => {
  it('renders a Today link in the sales nav', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const link = screen.getByRole('link', { name: 'Today' })
    expect(link).toHaveAttribute('href', '/acme/today')
  })

  it('hides Today when the leads module is disabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={[]} />)
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })
})

describe('AdminSidebar light shell', () => {
  it('renders the sidebar-token shell', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const sidebar = screen.getByRole('complementary')
    expect(sidebar).toHaveClass('bg-[color:var(--sidebar)]')
    expect(sidebar).not.toHaveClass('bg-gray-900')
  })
})
