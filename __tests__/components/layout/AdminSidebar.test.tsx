import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getEventType } from '@/lib/event-types'
import type { ModuleId } from '@/lib/industry-packs'

// Org-level nav renders when the path segment after orgSlug is a known org page
// (or absent). Individual tests below don't assert active-link state, so a
// single default is fine for both the event-nav and workspace-nav describes.
const nav = vi.hoisted(() => ({ pathname: '/acme' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

// The rail-collapse test persists to localStorage; clear it so later renders
// in this file start from the expanded sidebar.
beforeEach(() => {
  window.localStorage.clear()
  nav.pathname = '/acme'
})

describe('AdminSidebar — terminology-driven labels', () => {
  it('shows "Customers" for event event type', () => {
    const { terminology } = getEventType('event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('shows "Stations" for catering event type', () => {
    const { terminology } = getEventType('catering')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Stations')).toBeInTheDocument()
  })

  it('shows "Sessions" for photo-shoot event type', () => {
    const { terminology } = getEventType('photo-shoot')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('shows "Deliveries" for floral-event event type', () => {
    const { terminology } = getEventType('floral-event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Deliveries')).toBeInTheDocument()
  })

  it('always shows Dashboard regardless of event type', () => {
    const { terminology } = getEventType('catering')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('includes a Settings nav link', () => {
    const { terminology } = getEventType('event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    // Two Settings links now: the job's own settings page and the workspace
    // Settings section, which no longer disappears inside a job.
    const hrefs = screen.getAllByRole('link', { name: 'Settings' }).map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/acme/camp-2026/settings')
  })
})

describe('AdminSidebar — workspace nav (no eventSlug)', () => {
  function renderNav(enabledModules?: ModuleId[]) {
    return render(<AdminSidebar orgSlug="acme" enabledModules={enabledModules} catalogLabel="Packages" />)
  }

  it('omits gated-out top-trio links but keeps relative order', () => {
    renderNav(['calendar', 'events', 'registrants'])
    const labels = screen.getAllByRole('link').map((l) => l.textContent)
    const calendar = labels.indexOf('Calendar')
    expect(calendar).toBeGreaterThanOrEqual(0)
    expect(labels).not.toContain('Today')
    expect(labels).not.toContain('Clients')
    expect(labels.indexOf('Registrants')).toBeGreaterThan(calendar)
  })

  it('renders an Events section whose label links to the events list', () => {
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants', 'vendors'])
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/acme')
  })

  it('Catalog section contains Vendors and Forms', () => {
    renderNav(['vendors', 'forms'])
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Forms')).toBeInTheDocument()
  })

  it('Catalog section also includes Packages and Compliance when gated in', () => {
    renderNav(['vendors', 'forms', 'catalog', 'compliance'])
    const catalog = screen.getByRole('button', { name: /expand catalog/i }).closest('div')!.parentElement!
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    const labels = within(catalog)
      .getAllByRole('link')
      .map((l) => l.textContent)
      .filter((l) => l !== 'Catalog')
    expect(labels).toEqual(['Packages', 'Vendors', 'Forms', 'Compliance'])
  })

  it('omits Catalog entirely when none of its modules are enabled', () => {
    renderNav(['calendar'])
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument()
  })

  it('renders an icon with every workspace nav item', () => {
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants', 'vendors', 'forms', 'reports', 'invoices'])
    fireEvent.click(screen.getByRole('button', { name: /expand money/i }))
    for (const label of ['Calendar', 'Clients', 'Events', 'Today', 'Pipeline', 'Reports']) {
      const link = screen.getByRole('link', { name: label })
      expect(link.querySelector('svg')).toBeInTheDocument()
    }
  })

  it('collapses the Catalog section', () => {
    renderNav(['vendors', 'forms'])
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Forms')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /collapse catalog/i }))
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
    expect(screen.queryByText('Forms')).not.toBeInTheDocument()
  })

  it('collapses to an icon rail and persists', () => {
    window.localStorage.removeItem('tx-sidebar-collapsed')
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants'])

    const collapseButton = screen.getByRole('button', { name: 'Collapse navigation' })
    fireEvent.click(collapseButton)

    const pipelineLink = screen.getByLabelText('Pipeline')
    expect(pipelineLink.tagName).toBe('A')
    expect(pipelineLink.textContent).toBe('')
    expect(window.localStorage.getItem('tx-sidebar-collapsed')).toBe('1')
  })
})

describe('AdminSidebar — Option C IA', () => {
  const events = [
    { id: 'e1', name: 'Hendricks wedding', slug: 'hendricks', label: 'Today', isToday: true },
    { id: 'e2', name: 'Boise chamber mixer', slug: 'boise', label: 'Aug 20', isToday: false },
  ]

  it('renders the top trio in order: Today, Calendar, Clients', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const links = screen.getAllByRole('link').map((a) => a.textContent)
    const today = links.indexOf('Today')
    expect(today).toBeGreaterThanOrEqual(0)
    expect(links.indexOf('Calendar')).toBe(today + 1)
    expect(links.indexOf('Clients')).toBe(today + 2)
  })

  it('does not render a "Quick Links" group label', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.queryByText('Quick Links')).not.toBeInTheDocument()
  })

  it('links the Money label to the money landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/money')
  })

  it('links the Catalog label to the catalog landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/acme/catalog')
  })

  it('links the Settings label to the settings landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/acme/settings')
  })

  it('expands a section when its chevron is clicked, without navigating', () => {
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /expand money/i }))
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/acme/invoices')
  })

  it('renders upcoming events with their date labels when Events is expanded', () => {
    render(<AdminSidebar orgSlug="acme" upcomingEvents={events} />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    // 'Today' appears both as the top-trio nav item and as this row's date
    // label, so scope the label assertion to the event row itself.
    const row = screen.getByRole('link', { name: /Hendricks wedding/ })
    expect(within(row).getByText('Hendricks wedding')).toBeInTheDocument()
    expect(within(row).getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Aug 20')).toBeInTheDocument()
  })

  it('links an upcoming event row to that job dashboard', () => {
    render(<AdminSidebar orgSlug="acme" upcomingEvents={events} />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    expect(screen.getByRole('link', { name: /Hendricks wedding/ })).toHaveAttribute('href', '/acme/hendricks/dashboard')
  })

  it('keeps the business nav visible inside a job, with the job nav under Events', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="hendricks" />)
    // business nav survives
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/acme/clients')
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/money')
    // job nav renders inside the open Events section
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/acme/hendricks/dashboard')
    expect(screen.getByRole('link', { name: 'All events' })).toHaveAttribute('href', '/acme')
  })

  it('keeps the job nav for packs whose modules omit "events"', () => {
    // caterer/florist/photographer packs have no 'events' module, but the
    // [eventSlug] routes are not module-gated — the job nav must still render.
    const modules: ModuleId[] = ['leads', 'clients', 'proposals', 'invoices']
    render(<AdminSidebar orgSlug="acme" eventSlug="gala" enabledModules={modules} />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/acme/gala/dashboard')
    expect(screen.getByRole('link', { name: 'All events' })).toHaveAttribute('href', '/acme')
  })

  it('renders on settings pages that are not in the top-level slug list', () => {
    nav.pathname = '/acme/branding'
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/acme/settings')
    expect(screen.getByRole('link', { name: 'Branding' })).toHaveAttribute('href', '/acme/branding')
  })

  it('opens the section that owns the current page with no click', () => {
    nav.pathname = '/acme/invoices'
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/acme/invoices')
  })

  it('opens Catalog on a catalog child page with no click', () => {
    nav.pathname = '/acme/vendors'
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Vendors' })).toHaveAttribute('href', '/acme/vendors')
  })

  it('gates the collapsed rail exactly like the expanded nav', () => {
    // No catalog modules: neither the expanded section nor the rail icon.
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads', 'clients']} />)
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.queryByLabelText('Catalog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Money')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Pipeline')).toBeInTheDocument()
  })

  it('hides the Money section when the invoices module is off', () => {
    const modules: ModuleId[] = ['events', 'calendar', 'clients']
    render(<AdminSidebar orgSlug="acme" enabledModules={modules} />)
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })
})
