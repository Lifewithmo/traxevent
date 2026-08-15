import { render, screen, within, fireEvent } from '@testing-library/react'
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
    return screen.getByText(label, { selector: 'p, span' }).closest('div')!
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

  it('shows the storefront link with the pack label when the module is enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['storefront']} catalogLabel="Menu Packages" storefrontLabel="Drops" />)
    expect(screen.getByText('Drops')).toBeInTheDocument()
  })

  it('renders an icon with every workspace nav item', () => {
    renderNav(['calendar', 'clients', 'events', 'leads', 'registrants', 'vendors', 'forms', 'reports'])
    for (const label of ['Calendar', 'Clients', 'Events', 'Today', 'Pipeline', 'Reports']) {
      const link = screen.getByRole('link', { name: label })
      expect(link.querySelector('svg')).toBeInTheDocument()
    }
  })

  it('collapses the Operations section', () => {
    renderNav(['vendors', 'forms'])
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Forms')).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Operations' })
    fireEvent.click(toggle)
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
    expect(screen.queryByText('Forms')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Forms')).toBeInTheDocument()
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

// Below md the rail becomes an off-canvas drawer: a fixed 224px column left ~63px
// of content at 375px, which made every admin page unusable on a phone. jsdom has
// no viewport, so these pin the mechanism (classes + open/close state) rather than
// measured geometry — the width itself is checked in the browser.
describe('AdminSidebar — mobile drawer', () => {
  function renderNav() {
    window.localStorage.removeItem('tx-sidebar-collapsed')
    return render(<AdminSidebar orgSlug="acme" enabledModules={['calendar', 'clients']} catalogLabel="Packages" />)
  }

  it('takes no layout width below md — only the drawer trigger is in flow', () => {
    const { container } = renderNav()
    const aside = container.querySelector('aside')!
    // Out of flow on mobile so `main` gets the full viewport…
    expect(aside.className).toMatch(/max-md:fixed/)
    // …and the in-flow rail width is scoped to md and up.
    expect(aside.className).toMatch(/md:w-56/)
    expect(aside.className).not.toMatch(/(?<!md:)\bw-56\b/)
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
  })

  it('starts closed, opens on the trigger, and closes on the close button', () => {
    const { container } = renderNav()
    const aside = container.querySelector('aside')!
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    expect(aside.className).toMatch(/max-md:-translate-x-full/)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(container.querySelector('aside')!.className).toMatch(/max-md:translate-x-0/)
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(container.querySelector('aside')!.className).toMatch(/max-md:-translate-x-full/)
  })

  it('closes on Escape', () => {
    const { container } = renderNav()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(container.querySelector('aside')!.className).toMatch(/max-md:translate-x-0/)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('aside')!.className).toMatch(/max-md:-translate-x-full/)
  })

  it('the trigger controls the drawer it labels', () => {
    const { container } = renderNav()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    expect(trigger).toHaveAttribute('aria-controls', 'admin-nav')
    expect(container.querySelector('aside')!.id).toBe('admin-nav')
  })

  it('keeps the wordmark in the drawer even when the desktop rail is collapsed', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    // "T" is the rail treatment (hidden below md); the drawer keeps the full name.
    const wordmarks = screen.getAllByText('TraxEvent')
    expect(wordmarks.some((n) => n.className.includes('md:hidden'))).toBe(true)
  })
})
