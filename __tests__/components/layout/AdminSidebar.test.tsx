import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getEventType } from '@/lib/event-types'
import type { ModuleId } from '@/lib/industry-packs'

// Org-level nav renders when the path segment after orgSlug is a known org page
// (or absent). Individual tests below don't assert active-link state, so a
// single default is fine for both the event-nav and workspace-nav describes.
vi.mock('next/navigation', () => ({
  usePathname: () => '/acme',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

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
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

describe('AdminSidebar — workspace nav (no eventSlug)', () => {
  function renderNav(enabledModules?: ModuleId[]) {
    return render(<AdminSidebar orgSlug="acme" enabledModules={enabledModules} catalogLabel="Packages" />)
  }

  function sectionFor(label: string) {
    return screen.getByText(label, { selector: 'p' }).closest('div')!
  }

  it('Quick Links order: Calendar, Clients, Events, Today, Registrants', () => {
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants'])
    const quickLinks = sectionFor('Quick Links')
    const labels = within(quickLinks).getAllByRole('link').map((l) => l.textContent)
    expect(labels).toEqual(['Calendar', 'Clients', 'Events', 'Today', 'Registrants'])
  })

  it('omits gated-out Quick Links but keeps relative order', () => {
    renderNav(['calendar', 'events', 'registrants'])
    const quickLinks = sectionFor('Quick Links')
    const labels = within(quickLinks).getAllByRole('link').map((l) => l.textContent)
    expect(labels).toEqual(['Calendar', 'Events', 'Registrants'])
  })

  it('does not render an "Events" section', () => {
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants', 'vendors'])
    expect(screen.queryByText('Events', { selector: 'p' })).not.toBeInTheDocument()
  })

  it('Operations section contains Vendors and Forms', () => {
    renderNav(['vendors', 'forms'])
    const operations = sectionFor('Operations')
    expect(within(operations).getByText('Vendors')).toBeInTheDocument()
    expect(within(operations).getByText('Forms')).toBeInTheDocument()
  })

  it('Operations section also includes Packages and Compliance when gated in', () => {
    renderNav(['vendors', 'forms', 'catalog', 'compliance'])
    const operations = sectionFor('Operations')
    const labels = within(operations).getAllByRole('link').map((l) => l.textContent)
    expect(labels).toEqual(['Vendors', 'Packages', 'Forms', 'Compliance'])
  })

  it('omits Operations entirely when none of its modules are enabled', () => {
    renderNav(['calendar'])
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
  })
})
