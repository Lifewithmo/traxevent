'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import { endSession } from '@/lib/auth/establish-session'
import { NavIcon, type NavIconName } from '@/components/layout/NavIcons'
import type { Terminology } from '@/lib/event-types'
import type { EventPage } from '@/lib/types'
import type { ModuleId } from '@/lib/industry-packs'

interface AdminSidebarProps {
  orgSlug: string
  eventSlug?: string
  terminology?: Terminology
  allowedEventPages?: EventPage[]
  enabledModules?: ModuleId[]
  catalogLabel?: string
}

const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'today', 'leads', 'clients', 'proposals',
  'invoices', 'vendors', 'calendar', 'new-event', 'packages', 'compliance',
])

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

const SETTINGS_SLUGS = ['members', 'permissions', 'billing', 'email-domain', 'event-types', 'departments']

type NavLink = { href: string; label: string; icon: NavIconName; active: boolean }

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

// Two-pane collapse glyph (kit's PanelIcon), used only for the rail toggle button.
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[color:var(--sidebar-muted)]">
      {children}
    </span>
  )
}

function Section({
  label,
  children,
  collapsible = false,
  open = true,
  onToggle,
}: {
  label: string
  children: React.ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="px-2 py-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full flex items-center justify-between px-3 pb-1 text-[color:var(--sidebar-muted)] hover:text-[color:var(--sidebar-accent-foreground)]"
        >
          <SectionLabel>{label}</SectionLabel>
          <span
            aria-hidden
            className={`text-[10px] transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
          >
            &#9662;
          </span>
        </button>
      ) : (
        <p className="px-3 pb-1">
          <SectionLabel>{label}</SectionLabel>
        </p>
      )}
      {(!collapsible || open) && <div className="space-y-0.5">{children}</div>}
    </div>
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

export function AdminSidebar({ orgSlug, eventSlug, terminology, allowedEventPages, enabledModules, catalogLabel }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Hooks must run unconditionally before any early return (rules of hooks).
  const settingsActive = SETTINGS_SLUGS.some(
    (s) => pathname === `/${orgSlug}/${s}` || pathname.startsWith(`/${orgSlug}/${s}/`)
  )
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)
  const [salesOpen, setSalesOpen] = useState(true)
  const [opsOpen, setOpsOpen] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  // Read persisted rail state after mount only — never in a useState
  // initializer, to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
      setCollapsed(true)
    }
  }, [])

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

  const quickLinks: NavLink[] = [
    { module: 'calendar' as ModuleId, label: 'Calendar', slug: 'calendar', icon: 'calendar' as NavIconName },
    { module: 'clients' as ModuleId, label: 'Clients', slug: 'clients', icon: 'clients' as NavIconName },
    { module: 'leads' as ModuleId, label: 'Today', slug: 'today', icon: 'today' as NavIconName },
    { module: 'registrants' as ModuleId, label: 'Registrants', slug: 'registrants', icon: 'clients' as NavIconName },
  ]
    .filter((l) => has(l.module))
    .map((l) => ({
      href: `/${orgSlug}/${l.slug}`,
      label: l.label,
      icon: l.icon,
      active: isActive(pathname, `/${orgSlug}/${l.slug}`),
    }))

  const eventsLink: NavLink | null = has('events')
    ? { href: `/${orgSlug}`, label: 'Events', icon: 'events', active: pathname === `/${orgSlug}` }
    : null

  const beforeEvents = quickLinks.filter((l) => l.href === `/${orgSlug}/calendar` || l.href === `/${orgSlug}/clients`)
  const afterEvents = quickLinks.filter((l) => l.href === `/${orgSlug}/today` || l.href === `/${orgSlug}/registrants`)

  const allQuickLinks: NavLink[] = [...beforeEvents, ...(eventsLink ? [eventsLink] : []), ...afterEvents]

  const salesLinks: NavLink[] = [
    { module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads', icon: 'pipeline' as NavIconName },
    { module: 'proposals' as ModuleId, label: 'Proposals', slug: 'proposals', icon: 'proposals' as NavIconName },
    { module: 'invoices' as ModuleId, label: 'Invoices', slug: 'invoices', icon: 'invoices' as NavIconName },
  ]
    .filter((l) => has(l.module))
    .map((l) => ({
      href: `/${orgSlug}/${l.slug}`,
      label: l.label,
      icon: l.icon,
      active: isActive(pathname, `/${orgSlug}/${l.slug}`),
    }))

  const opsLinks: NavLink[] = [
    ...(has('vendors') ? [{ slug: 'vendors', label: 'Vendors', icon: 'vendors' as NavIconName }] : []),
    ...(has('catalog') ? [{ slug: 'packages', label: catalogLabel ?? 'Packages', icon: 'packages' as NavIconName }] : []),
    ...(has('forms') ? [{ slug: 'forms', label: 'Forms', icon: 'forms' as NavIconName }] : []),
    ...(has('compliance') ? [{ slug: 'compliance', label: 'Compliance', icon: 'compliance' as NavIconName }] : []),
  ].map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active: isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))

  const reportsLink: NavLink | null = has('reports')
    ? { href: `/${orgSlug}/reports`, label: 'Reports', icon: 'reports', active: isActive(pathname, `/${orgSlug}/reports`) }
    : null

  const settingsLinks: NavLink[] = [
    { slug: 'members', label: 'Members', icon: 'members' as NavIconName },
    { slug: 'permissions', label: 'Permissions', icon: 'permissions' as NavIconName },
    { slug: 'billing', label: 'Billing', icon: 'billing' as NavIconName },
    { slug: 'branding', label: 'Branding', icon: 'branding' as NavIconName },
    { slug: 'public-profile', label: 'Public profile', icon: 'profile' as NavIconName },
    { slug: 'email-domain', label: 'Email domain', icon: 'email' as NavIconName },
    { slug: 'event-types', label: 'Event types', icon: 'types' as NavIconName },
    { slug: 'departments', label: 'Departments', icon: 'departments' as NavIconName },
  ].map((l) => ({
    href: `/${orgSlug}/${l.slug}`,
    label: l.label,
    icon: l.icon,
    active: isActive(pathname, `/${orgSlug}/${l.slug}`),
  }))

  const eventNav = getEventNav(t)
  const visibleEventNav = eventNav
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
    <aside
      className={[
        'bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] border-r border-[color:var(--sidebar-border)]',
        'min-h-screen flex flex-col flex-shrink-0 print:hidden transition-[width] duration-[160ms]',
        !eventSlug && collapsed ? 'w-[52px]' : 'w-56',
      ].join(' ')}
    >
      <div className="px-4 py-5 border-b border-[color:var(--sidebar-border)] flex items-center justify-between gap-2">
        {!eventSlug && collapsed ? (
          <Link href={`/${orgSlug}`} className="font-bold text-lg tracking-tight" title="TraxEvent">
            T
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
            className="flex items-center justify-center w-6 h-6 rounded text-[color:var(--sidebar-muted)] hover:text-[color:var(--sidebar-accent-foreground)]"
          >
            <PanelIcon />
          </button>
        )}
      </div>

      {eventSlug ? (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Event navigation">
          <Link
            href={`/${orgSlug}`}
            className="block px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            &larr; Events
          </Link>
          {visibleEventNav.map(({ key, label }) => {
            const href = `/${orgSlug}/${eventSlug}/${key}`
            const active = isActive(pathname, href)
            return (
              <Link
                key={key}
                href={href}
                className={[
                  'block px-3 py-2 rounded-md text-sm font-medium transition-colors border-l-2',
                  active
                    ? 'bg-gray-100 text-gray-900 border-gray-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-transparent',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      ) : collapsed ? (
        <nav className="flex-1" aria-label="Workspace navigation">
          <IconRailGroup items={allQuickLinks} />
          {has('leads') && <IconRailGroup items={salesLinks} />}
          <IconRailGroup items={opsLinks} />
          {reportsLink && <IconRailGroup items={[reportsLink]} />}
          <IconRailGroup
            items={[{ href: `/${orgSlug}/members`, label: 'Settings', icon: 'settings', active: settingsActive }]}
          />
        </nav>
      ) : (
        <nav className="flex-1" aria-label="Workspace navigation">
          {(allQuickLinks.length > 0) && (
            <Section label="Quick Links">
              {allQuickLinks.map((l) => (
                <NavItem key={l.href} {...l} />
              ))}
            </Section>
          )}

          {has('leads') && salesLinks.length > 0 && (
            <Section label="Sales Pipeline" collapsible open={salesOpen} onToggle={() => setSalesOpen((v) => !v)}>
              {salesLinks.map((l) => (
                <NavItem key={l.href} {...l} indent />
              ))}
            </Section>
          )}

          {opsLinks.length > 0 && (
            <Section label="Operations" collapsible open={opsOpen} onToggle={() => setOpsOpen((v) => !v)}>
              {opsLinks.map((l) => (
                <NavItem key={l.href} {...l} indent />
              ))}
            </Section>
          )}

          {reportsLink && (
            <Section label="Insights">
              <NavItem {...reportsLink} />
            </Section>
          )}

          <Section
            label="Settings"
            collapsible
            open={settingsOpen}
            onToggle={() => setSettingsOpen((v) => !v)}
          >
            {settingsLinks.map((l) => (
              <NavItem key={l.href} {...l} indent />
            ))}
          </Section>
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
  )
}
