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

  it('shows the storefront link with the pack label when the module is enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['storefront']} catalogLabel="Menu Packages" storefrontLabel="Drops" />)
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    expect(screen.getByRole('link', { name: 'Drops' })).toHaveAttribute('href', '/acme/drops')
  })

  it('places the storefront link directly after Packages in the Catalog section', () => {
    renderNav(['catalog', 'storefront', 'vendors', 'forms', 'compliance'])
    const catalog = screen.getByRole('button', { name: /expand catalog/i }).closest('div')!.parentElement!
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    const labels = within(catalog)
      .getAllByRole('link')
      .map((l) => l.textContent)
      .filter((l) => l !== 'Catalog')
    expect(labels).toEqual(['Packages', 'Online orders', 'Vendors', 'Forms', 'Compliance'])
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

  it('renders Registrants between Events and Money in the expanded nav', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels.indexOf('Registrants')).toBe(labels.indexOf('Events') + 1)
    expect(labels.indexOf('Money')).toBe(labels.indexOf('Registrants') + 1)
  })

  it('puts Registrants in the same slot on the collapsed rail', () => {
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    const labels = screen.getAllByRole('link').map((a) => a.getAttribute('aria-label'))
    expect(labels.indexOf('Registrants')).toBe(labels.indexOf('Events') + 1)
    expect(labels.indexOf('Money')).toBe(labels.indexOf('Registrants') + 1)
  })

  it('hides the Money section when the invoices module is off', () => {
    const modules: ModuleId[] = ['events', 'calendar', 'clients']
    render(<AdminSidebar orgSlug="acme" enabledModules={modules} />)
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })
})

// Active state is expressed purely through classes: a child row gets the
// primary left border, a rail icon gets the accent background outright (the
// inactive variant only carries it behind `hover:`).
function rowActive(name: string | RegExp) {
  const link = screen.getByRole('link', { name })
  return link.className.split(/\s+/).includes('border-[color:var(--sidebar-primary)]')
}

function sectionActive(label: string) {
  const row = screen.getByRole('link', { name: label }).parentElement!
  return row.className.split(/\s+/).includes('border-[color:var(--sidebar-primary)]')
}

describe('AdminSidebar — active state', () => {
  it.each(['branding', 'proposal-templates', 'public-profile', 'members', 'departments'])(
    'highlights the Settings parent on /%s',
    (slug) => {
      nav.pathname = `/acme/${slug}`
      render(<AdminSidebar orgSlug="acme" />)
      expect(sectionActive('Settings')).toBe(true)
    },
  )

  it('highlights the Settings rail icon on a child page missing from the old slug list', () => {
    nav.pathname = '/acme/branding'
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    const icon = screen.getByLabelText('Settings')
    expect(icon.className.split(/\s+/)).toContain('bg-[color:var(--sidebar-accent)]')
  })

  it('opens Events and highlights "+ New event" on /new-event', () => {
    nav.pathname = '/acme/new-event'
    render(<AdminSidebar orgSlug="acme" />)
    expect(rowActive('+ New event')).toBe(true)
    expect(rowActive('All events')).toBe(false)
    expect(sectionActive('Events')).toBe(true)
  })

  it('highlights "All events" on the org root', () => {
    nav.pathname = '/acme'
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    expect(rowActive('All events')).toBe(true)
    expect(rowActive('+ New event')).toBe(false)
  })

  it('highlights exactly one row on /leads/tasks', () => {
    nav.pathname = '/acme/leads/tasks'
    render(<AdminSidebar orgSlug="acme" />)
    expect(rowActive('Tasks')).toBe(true)
    expect(rowActive('Opportunities')).toBe(false)
  })

  it('keeps Opportunities highlighted on a lead detail route', () => {
    nav.pathname = '/acme/leads/lead-123'
    render(<AdminSidebar orgSlug="acme" />)
    expect(rowActive('Opportunities')).toBe(true)
    expect(rowActive('Tasks')).toBe(false)
  })
})

describe('AdminSidebar — independent nav scroll', () => {
  // The real invariant is layout, not class names: the <aside>'s computed
  // height must never exceed the viewport, and — given content taller than
  // the nav's box — nav.scrollHeight must exceed nav.clientHeight (i.e. the
  // nav, not the window, is the thing that scrolls).
  //
  // jsdom does not run a layout engine: every element reports
  // clientHeight/scrollHeight/getComputedStyle height as 0, regardless of
  // content or CSS, so neither half of that invariant is observable here.
  // These assertions are therefore an honest fallback, not a substitute:
  // they confirm the three classes that together produce the bounded-height
  // mechanism are present on the right elements —
  //   <aside>: h-screen (bounds it to the viewport) + sticky top-0 (keeps it
  //     pinned to the viewport while the page scrolls, since min-h-screen is
  //     only a floor and lets the aside grow past the viewport with content)
  //   <nav>: min-h-0 + overflow-y-auto (lets the nav actually shrink to the
  //     space the bounded aside leaves it, and scroll internally once it does)
  // — but they cannot prove the box is actually bounded or actually scrolls.
  // That requires a real layout engine: verified manually in a browser (see
  // pre-merge-fix-report.md) since this repo's test setup has no Playwright/
  // browser-mode Vitest target to assert scrollHeight/clientHeight against.
  it('bounds the aside to the viewport and pins it (expanded nav)', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const aside = document.querySelector('aside')!
    expect(aside.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-screen', 'sticky', 'top-0'])
    )
    expect(aside.className).not.toMatch(/(^|\s)min-h-screen(\s|$)/)
    const nav = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(nav.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['overflow-y-auto', 'min-h-0'])
    )
  })

  it('bounds the aside to the viewport and pins it (collapsed rail)', () => {
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    const aside = document.querySelector('aside')!
    expect(aside.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-screen', 'sticky', 'top-0'])
    )
    const nav = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(nav.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['overflow-y-auto', 'min-h-0'])
    )
  })

  it('bounds the aside to the viewport in the in-job nav too', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="hendricks" />)
    const aside = document.querySelector('aside')!
    expect(aside.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-screen', 'sticky', 'top-0'])
    )
    const nav = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(nav.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['overflow-y-auto', 'min-h-0'])
    )
  })
})

describe('AdminSidebar — open section follows client-side navigation', () => {
  it('opens the destination section and closes the previous one', () => {
    nav.pathname = '/acme/invoices'
    const { rerender } = render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument()

    // Same component instance, new pathname — exactly what a sidebar link does.
    nav.pathname = '/acme/vendors'
    rerender(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Vendors' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('does not undo a manual toggle while the pathname is unchanged', () => {
    nav.pathname = '/acme/clients'
    const { rerender } = render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /expand money/i }))
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument()

    rerender(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument()
  })

  it('leaves Events shut on the org root, whose page already lists them', () => {
    nav.pathname = '/acme/invoices'
    const { rerender } = render(<AdminSidebar orgSlug="acme" />)
    nav.pathname = '/acme'
    rerender(<AdminSidebar orgSlug="acme" />)
    expect(screen.queryByRole('link', { name: 'All events' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('keeps Events force-open inside a job', () => {
    nav.pathname = '/acme/hendricks/budget'
    render(<AdminSidebar orgSlug="acme" eventSlug="hendricks" />)
    expect(screen.getByRole('link', { name: 'All events' })).toBeInTheDocument()
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
