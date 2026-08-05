import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/acme'),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/auth/establish-session', () => ({ endSession: vi.fn() }))

import { usePathname } from 'next/navigation'
import { AdminSidebar } from '@/components/layout/AdminSidebar'

afterEach(() => {
  // Restore the default pathname so tests that don't care about routing stay unaffected.
  vi.mocked(usePathname).mockReturnValue('/acme')
})

describe('AdminSidebar workspace nav gating', () => {
  it('shows every workspace link when enabledModules is omitted', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Registrants')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('hides links whose module is not enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads', 'invoices', 'calendar']} />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()   // leads
    expect(screen.getByText('Invoices')).toBeInTheDocument()   // invoices
    expect(screen.queryByText('Registrants')).not.toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
  })

  it('hides a section header when none of its links are enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Insights holds only Reports; with reports disabled the header is gone.
    expect(screen.queryByText('Insights')).not.toBeInTheDocument()
  })

  it('always shows the Settings block regardless of modules', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Settings panel is collapsed by default on non-settings routes; expand it.
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByText('Members')).toBeInTheDocument()
  })
})

describe('AdminSidebar route mounting', () => {
  it('stays mounted on the /today route (regression: today must be in ORG_PAGE_SLUGS)', () => {
    vi.mocked(usePathname).mockReturnValue('/acme/today')
    render(<AdminSidebar orgSlug="acme" />)
    // Before the fix, /today wasn't in ORG_PAGE_SLUGS, so the whole sidebar
    // early-returned null on this route and none of its nav would render.
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
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
