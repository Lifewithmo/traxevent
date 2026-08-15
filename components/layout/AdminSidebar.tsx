'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import { endSession } from '@/lib/auth/establish-session'
import { NavIcon, type NavIconName } from '@/components/layout/NavIcons'
import { SidebarSection } from '@/components/layout/SidebarSection'
import type { Terminology } from '@/lib/event-types'
import type { EventKind, EventPage } from '@/lib/types'
import type { ModuleId } from '@/lib/industry-packs'
import { ORG_PAGE_SLUGS } from '@/lib/sidebar-nav'
import type { SidebarEventRow } from '@/lib/sidebar-events'

interface AdminSidebarProps {
  orgSlug: string
  eventSlug?: string
  eventKind?: EventKind
  terminology?: Terminology
  allowedEventPages?: EventPage[]
  enabledModules?: ModuleId[]
  catalogLabel?: string
  storefrontLabel?: string
  upcomingEvents?: SidebarEventRow[]
}

// Which parent section owns a given org page — so a hard load of /acme/invoices
// opens Money with the current page's row already visible.
const SECTION_FOR_SLUG: Record<string, string> = {
  'new-event': 'events',
  leads: 'pipeline',
  proposals: 'pipeline',
  money: 'money',
  invoices: 'money',
  reports: 'money',
  catalog: 'catalog',
  packages: 'catalog',
  drops: 'catalog',
  vendors: 'catalog',
  forms: 'catalog',
  compliance: 'catalog',
  settings: 'settings',
  members: 'settings',
  permissions: 'settings',
  billing: 'settings',
  branding: 'settings',
  'proposal-templates': 'settings',
  'public-profile': 'settings',
  'email-domain': 'settings',
  'event-types': 'settings',
  departments: 'settings',
}

// /{orgSlug} is deliberately absent: it is the all-events page itself and its
// section's children only duplicate what that page already lists. Inside a job
// the section is force-open regardless of this seed. /{orgSlug}/new-event is
// mapped, so hard-loading it opens Events.
function activeSection(pathname: string, orgSlug: string): string | null {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] !== orgSlug || seg.length < 2) return null
  return SECTION_FOR_SLUG[seg[1]] ?? null
}

const SIDEBAR_COLLAPSED_KEY = 'tx-sidebar-collapsed'

function getEventNav(terminology: Terminology) {
  return [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'ops', label: 'Event Ops' },
    { key: 'families', label: terminology.registrantPlural },
    { key: 'assignments', label: terminology.assignmentPlural },
    { key: 'teams', label: 'Teams' },
    { key: 'budget', label: 'Budget' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'communicate', label: 'Communicate' },
    { key: 'forms', label: 'Forms' },
    { key: 'people', label: 'People' },
    { key: 'checkin', label: 'Check-in' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ]
}

const DEFAULT_TERMINOLOGY: Terminology = getEventType(DEFAULT_EVENT_TYPE_ID).terminology

// Per-event nav items that belong to the optional attendee-roster module.
const ROSTER_KEYS = new Set(['families', 'assignments', 'checkin'])

// Market days get an explicit, minimal nav — none of the client-job pages
// (Ops, roster, Teams, Budget, etc.) apply. Register + Closeout join this
// list with the counter-register increment.
const MARKET_DAY_NAV = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'settings', label: 'Settings' },
]

// The single source of truth for Settings' children. The parent's active state
// is derived from these (see settingsActive) rather than from a second hand-kept
// slug list, which is how three of the nine drifted out of it.
const SETTINGS_CHILDREN: Array<{ slug: string; label: string; icon: NavIconName }> = [
  { slug: 'members', label: 'Members', icon: 'members' },
  { slug: 'permissions', label: 'Permissions', icon: 'permissions' },
  { slug: 'billing', label: 'Billing', icon: 'billing' },
  { slug: 'branding', label: 'Branding', icon: 'branding' },
  { slug: 'proposal-templates', label: 'Proposal templates', icon: 'proposals' },
  { slug: 'public-profile', label: 'Public profile', icon: 'profile' },
  { slug: 'email-domain', label: 'Email domain', icon: 'email' },
  { slug: 'event-types', label: 'Event types', icon: 'types' },
  { slug: 'departments', label: 'Departments', icon: 'departments' },
]

type NavLink = { href: string; label: string; icon: NavIconName; active: boolean }

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

// Two-pane collapse glyph (kit's PanelIcon), used only for the rail toggle button.
function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <path d="M4 4l10 10M14 4L4 14" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  )
}

function NavItem({ href, label, icon, active, indent = false }: NavLink & { indent?: boolean }) {
  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-[10px] rounded-md text-sm font-medium transition-colors border-l-2',
        indent ? 'pl-[26px] pr-3 py-2' : 'px-3 py-2',
        active
          ? 'bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)] border-[color:var(--sidebar-primary)]'
          : 'text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)] border-transparent',
      ].join(' ')}
    >
      <NavIcon name={icon} />
      <span>{label}</span>
    </Link>
  )
}

function IconRailItem({ href, label, icon, active }: NavLink) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={[
        'flex items-center justify-center w-8 h-8 mx-auto rounded-md transition-colors',
        active
          ? 'bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)]'
          : 'text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]',
      ].join(' ')}
    >
      <NavIcon name={icon} />
    </Link>
  )
}

function IconRailGroup({ items }: { items: NavLink[] }) {
  if (items.length === 0) return null
  return (
    <div className="px-2 py-2 space-y-1 border-t border-[color:var(--sidebar-border)] first:border-t-0">
      {items.map((l) => (
        <IconRailItem key={l.href} {...l} />
      ))}
    </div>
  )
}

export function AdminSidebar({ orgSlug, eventSlug, eventKind, terminology, allowedEventPages, enabledModules, catalogLabel, storefrontLabel, upcomingEvents }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Hooks must run unconditionally before any early return (rules of hooks).
  const settingsLinks: NavLink[] = SETTINGS_CHILDREN.map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active: isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))
  // Derived, never listed twice: the parent lights up whenever any child does,
  // plus on its own landing page.
  const settingsActive = settingsLinks.some((l) => l.active) || isActive(pathname, `/${orgSlug}/settings`)

  // Exactly one section is open at a time, seeded to whichever section owns the
  // current page so a hard load shows the current row without a click.
  const [openSection, setOpenSection] = useState<string | null>(() => activeSection(pathname, orgSlug))
  const [collapsed, setCollapsed] = useState(false)
  // Below md the sidebar is an off-canvas drawer rather than an in-flow rail —
  // a fixed 224px column leaves ~63px of content at 375px. Deliberately NOT
  // persisted: a drawer should always open closed on a fresh page.
  const [mobileOpen, setMobileOpen] = useState(false)

  // Client-side navigation does not remount the sidebar, so the seed above runs
  // once and only once — without this, every in-app hop leaves the previous
  // section open and the destination's shut. Re-seed during render (React's
  // "adjust state when a prop changes" pattern; no effect, so no flash of the
  // stale section), guarded by the last-seeded path so a manual toggle on the
  // page the user is standing on is never undone.
  const [seededFor, setSeededFor] = useState(pathname)
  if (seededFor !== pathname) {
    setSeededFor(pathname)
    setOpenSection(activeSection(pathname, orgSlug))
  }

  function toggleSection(key: string) {
    setOpenSection((cur) => (cur === key ? null : key))
  }

  // Read persisted rail state after mount only — never in a useState
  // initializer, to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
      setCollapsed(true)
    }
  }, [])

  // Navigating is the drawer's implicit dismiss — without this the overlay stays
  // over the page the operator just chose.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  // Rendered by BOTH the org layout (no eventSlug) and the event layout (with eventSlug).
  // On an event route the event layout renders the contextual event sidebar, so the
  // org-layout instance hides itself to avoid a doubled sidebar.
  if (!eventSlug) {
    const seg = pathname.split('/').filter(Boolean)
    if (seg.length >= 2 && !ORG_PAGE_SLUGS.has(seg[1])) return null
  }

  const t = terminology ?? DEFAULT_TERMINOLOGY

  const has = (m: ModuleId) => !enabledModules || enabledModules.includes(m)

  // The top trio: flat rows, no section header, no chevron.
  const topLinks: NavLink[] = [
    { module: 'leads' as ModuleId, label: 'Today', slug: 'today', icon: 'today' as NavIconName },
    { module: 'calendar' as ModuleId, label: 'Calendar', slug: 'calendar', icon: 'calendar' as NavIconName },
    { module: 'clients' as ModuleId, label: 'Clients', slug: 'clients', icon: 'clients' as NavIconName },
  ]
    .filter((l) => has(l.module))
    .map((l) => ({
      href: `/${orgSlug}/${l.slug}`,
      label: l.label,
      icon: l.icon,
      active: isActive(pathname, `/${orgSlug}/${l.slug}`),
    }))

  const registrantsLink: NavLink | null = has('registrants')
    ? {
        href: `/${orgSlug}/registrants`,
        label: 'Registrants',
        icon: 'clients',
        active: isActive(pathname, `/${orgSlug}/registrants`),
      }
    : null

  // Tasks lives under the Opportunities href, so a plain prefix match lights
  // both rows on /leads/tasks. The more specific route wins; /leads/{leadId}
  // detail routes still belong to Opportunities.
  const tasksActive = isActive(pathname, `/${orgSlug}/leads/tasks`)

  const pipelineChildren: NavLink[] = [
    ...(has('leads') ? [{ slug: 'leads', label: 'Opportunities', icon: 'pipeline' as NavIconName }] : []),
    ...(has('leads') ? [{ slug: 'leads/tasks', label: 'Tasks', icon: 'today' as NavIconName }] : []),
    ...(has('proposals') ? [{ slug: 'proposals', label: 'Proposals', icon: 'proposals' as NavIconName }] : []),
  ].map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active:
      l.slug === 'leads'
        ? isActive(pathname, `/${orgSlug}/leads`) && !tasksActive
        : isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))

  const moneyChildren: NavLink[] = [
    ...(has('invoices') ? [{ slug: 'invoices', label: 'Invoices', icon: 'invoices' as NavIconName }] : []),
    ...(has('reports') ? [{ slug: 'reports', label: 'Reports', icon: 'reports' as NavIconName }] : []),
  ].map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active: isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))

  const catalogChildren: NavLink[] = [
    ...(has('catalog') ? [{ slug: 'packages', label: catalogLabel ?? 'Packages', icon: 'packages' as NavIconName }] : []),
    ...(has('storefront' as ModuleId) ? [{ slug: 'drops', label: storefrontLabel ?? 'Online orders', icon: 'packages' as NavIconName }] : []),
    ...(has('vendors') ? [{ slug: 'vendors', label: 'Vendors', icon: 'vendors' as NavIconName }] : []),
    ...(has('forms') ? [{ slug: 'forms', label: 'Forms', icon: 'forms' as NavIconName }] : []),
    ...(has('compliance') ? [{ slug: 'compliance', label: 'Compliance', icon: 'compliance' as NavIconName }] : []),
  ].map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active: isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))

  const allEventsActive = pathname === `/${orgSlug}`
  const newEventActive = isActive(pathname, `/${orgSlug}/new-event`)
  const eventsActive = allEventsActive || newEventActive || Boolean(eventSlug)

  const pipelineActive = pipelineChildren.some((l) => l.active)
  const moneyActive = isActive(pathname, `/${orgSlug}/money`) || moneyChildren.some((l) => l.active)
  const catalogActive = isActive(pathname, `/${orgSlug}/catalog`) || catalogChildren.some((l) => l.active)

  // At 52px there is nothing to expand, so the rail is flat icon links to each
  // section's landing page. Gating here must match the expanded nav's exactly,
  // or the rail offers a destination the expanded sidebar does not.
  const railLinks: NavLink[] = [
    ...topLinks,
    ...(pipelineChildren.length > 0
      ? [{ href: `/${orgSlug}/leads`, label: 'Pipeline', icon: 'pipeline' as NavIconName, active: pipelineActive }]
      : []),
    ...(has('events')
      ? [{ href: `/${orgSlug}`, label: 'Events', icon: 'events' as NavIconName, active: eventsActive }]
      : []),
    // Registrants sits between Events and Money in the expanded nav; the rail
    // must agree or the two modes teach different maps of the same product.
    ...(registrantsLink ? [registrantsLink] : []),
    ...(has('invoices') && moneyChildren.length > 0
      ? [{ href: `/${orgSlug}/money`, label: 'Money', icon: 'invoices' as NavIconName, active: moneyActive }]
      : []),
    ...(catalogChildren.length > 0
      ? [{ href: `/${orgSlug}/catalog`, label: 'Catalog', icon: 'packages' as NavIconName, active: catalogActive }]
      : []),
    {
      href: `/${orgSlug}/settings`,
      label: 'Settings',
      icon: 'settings' as NavIconName,
      active: settingsActive,
    },
  ]

  const eventNav = getEventNav(t)
  const visibleEventNav =
    eventKind === 'market_day'
      ? MARKET_DAY_NAV
      : eventNav
          .filter(
            (n) =>
              !allowedEventPages ||
              n.key === 'dashboard' ||
              n.key === 'settings' ||
              allowedEventPages.includes(n.key as EventPage)
          )
          .filter((n) => !ROSTER_KEYS.has(n.key) || has('attendee-roster'))

  async function handleSignOut() {
    await endSession()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile bar: the only nav chrome that takes layout space below md, so the
          page itself gets the full viewport width. Hidden from md up. */}
      <div className="flex items-center gap-3 border-b border-[color:var(--sidebar-border)] bg-[color:var(--sidebar)] px-4 py-3 text-[color:var(--sidebar-foreground)] md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="admin-nav"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
        >
          <MenuIcon />
        </button>
        <Link href={`/${orgSlug}`} className="text-lg font-bold tracking-tight">
          TraxEvent
        </Link>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="admin-nav"
        className={[
          'bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] border-r border-[color:var(--sidebar-border)]',
          // h-screen (not min-h-screen) in both modes: the nav below is the only
          // scroller, which is what keeps Sign out pinned to the bottom edge.
          'h-screen sticky top-0 flex flex-col print:hidden',
          // Below md: off-canvas drawer, out of flow so `main` gets full width.
          // `max-md:fixed` overrides the `sticky` above — Tailwind emits variant
          // utilities after their bare counterparts, so the media query wins.
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-64',
          'max-md:transition-transform max-md:duration-200',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
          // md and up: the in-flow rail, unchanged.
          'md:flex-shrink-0 md:transition-[width] md:duration-[160ms]',
          !eventSlug && collapsed ? 'md:w-[52px]' : 'md:w-56',
        ].join(' ')}
      >
      <div className="px-4 py-5 border-b border-[color:var(--sidebar-border)] flex items-center justify-between gap-2">
        {!eventSlug && collapsed ? (
          // Collapsed is a desktop-rail state; the drawer is always full width,
          // so it keeps the wordmark even while the rail shows just "T".
          <Link href={`/${orgSlug}`} className="font-bold text-lg tracking-tight" title="TraxEvent">
            <span className="max-md:hidden">T</span>
            <span className="md:hidden">TraxEvent</span>
          </Link>
        ) : (
          <Link href={`/${orgSlug}`} className="font-bold text-lg tracking-tight">
            TraxEvent
          </Link>
        )}
        {!eventSlug && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="flex items-center justify-center w-6 h-6 rounded text-[color:var(--sidebar-muted)] hover:text-[color:var(--sidebar-accent-foreground)] max-md:hidden"
          >
            <PanelIcon />
          </button>
        )}
        {/* Collapsing is a desktop affordance; on mobile the same slot closes the drawer. */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="flex items-center justify-center w-6 h-6 rounded text-[color:var(--sidebar-muted)] hover:text-[color:var(--sidebar-accent-foreground)] md:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      {!eventSlug && collapsed ? (
        <nav className="flex-1 min-h-0 overflow-y-auto" aria-label="Workspace navigation">
          <IconRailGroup items={railLinks} />
        </nav>
      ) : (
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5" aria-label="Workspace navigation">
          {topLinks.map((l) => (
            <NavItem key={l.href} {...l} />
          ))}

          {pipelineChildren.length > 0 && (
            <SidebarSection
              href={`/${orgSlug}/leads`}
              label="Pipeline"
              icon="pipeline"
              active={pipelineActive}
              open={openSection === 'pipeline'}
              onToggle={() => toggleSection('pipeline')}
            >
              {pipelineChildren.map((l) => (
                <NavItem key={l.href} {...l} indent />
              ))}
            </SidebarSection>
          )}

          {/* Inside a job the section renders regardless of the events module:
              the [eventSlug] routes are not module-gated, and several packs
              (caterer, florist, photographer) omit 'events' entirely. Without
              this the operator would have no job nav at all. */}
          {(has('events') || Boolean(eventSlug)) && (
            <SidebarSection
              href={`/${orgSlug}`}
              label="Events"
              icon="events"
              active={eventsActive}
              open={openSection === 'events' || Boolean(eventSlug)}
              onToggle={() => toggleSection('events')}
            >
              {eventSlug ? (
                <>
                  {visibleEventNav.map(({ key, label }) => (
                    <NavItem
                      key={key}
                      href={`/${orgSlug}/${eventSlug}/${key}`}
                      label={label}
                      icon="events"
                      active={isActive(pathname, `/${orgSlug}/${eventSlug}/${key}`)}
                      indent
                    />
                  ))}
                  <NavItem href={`/${orgSlug}`} label="All events" icon="events" active={allEventsActive} indent />
                </>
              ) : (
                <>
                  {(upcomingEvents ?? []).map((e) => (
                    <Link
                      key={e.id}
                      href={`/${orgSlug}/${e.slug}/dashboard`}
                      className="flex items-center gap-2 pl-[26px] pr-3 py-2 rounded-md text-sm text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
                    >
                      <span className="truncate flex-1">{e.name}</span>
                      <span className={`text-[10px] shrink-0 ${e.isToday ? 'font-semibold' : ''}`}>{e.label}</span>
                    </Link>
                  ))}
                  <NavItem href={`/${orgSlug}`} label="All events" icon="events" active={allEventsActive} indent />
                  <NavItem
                    href={`/${orgSlug}/new-event`}
                    label="+ New event"
                    icon="events"
                    active={newEventActive}
                    indent
                  />
                </>
              )}
            </SidebarSection>
          )}

          {registrantsLink && <NavItem {...registrantsLink} />}

          {has('invoices') && moneyChildren.length > 0 && (
            <SidebarSection
              href={`/${orgSlug}/money`}
              label="Money"
              icon="invoices"
              active={moneyActive}
              open={openSection === 'money'}
              onToggle={() => toggleSection('money')}
            >
              {moneyChildren.map((l) => (
                <NavItem key={l.href} {...l} indent />
              ))}
            </SidebarSection>
          )}

          {catalogChildren.length > 0 && (
            <SidebarSection
              href={`/${orgSlug}/catalog`}
              label="Catalog"
              icon="packages"
              active={catalogActive}
              open={openSection === 'catalog'}
              onToggle={() => toggleSection('catalog')}
            >
              {catalogChildren.map((l) => (
                <NavItem key={l.href} {...l} indent />
              ))}
            </SidebarSection>
          )}

          <SidebarSection
            href={`/${orgSlug}/settings`}
            label="Settings"
            icon="settings"
            active={settingsActive}
            open={openSection === 'settings'}
            onToggle={() => toggleSection('settings')}
          >
            {settingsLinks.map((l) => (
              <NavItem key={l.href} {...l} indent />
            ))}
          </SidebarSection>
        </nav>
      )}

      <div className="mt-auto px-2 py-4 border-t border-[color:var(--sidebar-border)]">
        {!eventSlug && collapsed ? (
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center justify-center w-8 h-8 mx-auto rounded-md text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
          >
            <NavIcon name="signout" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-[10px] w-full text-left px-3 py-2 rounded-md text-sm font-medium text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
          >
            <NavIcon name="signout" />
            <span>Sign out</span>
          </button>
        )}
      </div>
      </aside>
    </>
  )
}
