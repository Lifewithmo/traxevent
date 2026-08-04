'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import { endSession } from '@/lib/auth/establish-session'
import type { Terminology } from '@/lib/event-types'
import type { EventPage } from '@/lib/types'
import type { ModuleId } from '@/lib/industry-packs'

interface AdminSidebarProps {
  orgSlug: string
  eventSlug?: string
  terminology?: Terminology
  allowedEventPages?: EventPage[]
  enabledModules?: ModuleId[]
}

const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'leads', 'clients', 'proposals',
  'contracts', 'invoices', 'vendors', 'calendar', 'new-event',
])

function getEventNav(terminology: Terminology) {
  return [
    { key: 'dashboard', label: 'Dashboard' },
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-3">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function AdminSidebar({ orgSlug, eventSlug, terminology, allowedEventPages, enabledModules }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Hooks must run unconditionally before any early return (rules of hooks).
  const settingsActive = SETTINGS_SLUGS.some(
    (s) => pathname === `/${orgSlug}/${s}` || pathname.startsWith(`/${orgSlug}/${s}/`)
  )
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  // Rendered by BOTH the org layout (no eventSlug) and the event layout (with eventSlug).
  // On an event route the event layout renders the contextual event sidebar, so the
  // org-layout instance hides itself to avoid a doubled sidebar.
  if (!eventSlug) {
    const seg = pathname.split('/').filter(Boolean)
    if (seg.length >= 2 && !ORG_PAGE_SLUGS.has(seg[1])) return null
  }

  const t = terminology ?? DEFAULT_TERMINOLOGY

  const has = (m: ModuleId) => !enabledModules || enabledModules.includes(m)

  const salesLinks = [
    { module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads' },
    { module: 'clients' as ModuleId, label: 'Clients', slug: 'clients' },
    { module: 'proposals' as ModuleId, label: 'Proposals', slug: 'proposals' },
    { module: 'contracts' as ModuleId, label: 'Contracts', slug: 'contracts' },
    { module: 'invoices' as ModuleId, label: 'Invoices', slug: 'invoices' },
  ].filter((l) => has(l.module))

  const eventLinks = [
    { module: 'registrants' as ModuleId, label: 'Registrants', slug: 'registrants' },
    { module: 'vendors' as ModuleId, label: 'Vendors', slug: 'vendors' },
    { module: 'calendar' as ModuleId, label: 'Calendar', slug: 'calendar' },
  ].filter((l) => has(l.module))

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

  function navClass(href: string) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return [
      'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
      active
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white',
    ].join(' ')
  }

  function exactNavClass(href: string) {
    const active = pathname === href
    return [
      'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
      active
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white',
    ].join(' ')
  }

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <Link href={`/${orgSlug}`} className="font-bold text-white text-lg tracking-tight">
          TraxEvent
        </Link>
      </div>

      {eventSlug ? (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Event navigation">
          <Link
            href={`/${orgSlug}`}
            className="block px-3 py-2 rounded-md text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            &larr; Events
          </Link>
          {visibleEventNav.map(({ key, label }) => {
            const href = `/${orgSlug}/${eventSlug}/${key}`
            return (
              <Link key={key} href={href} className={navClass(href)}>
                {label}
              </Link>
            )
          })}
        </nav>
      ) : (
        <nav className="flex-1" aria-label="Workspace navigation">
          {salesLinks.length > 0 && (
            <Section label="Sales">
              {salesLinks.map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
            </Section>
          )}

          {(has('events') || eventLinks.length > 0) && (
            <Section label="Events">
              {has('events') && (
                <Link href={`/${orgSlug}`} className={exactNavClass(`/${orgSlug}`)}>
                  Events
                </Link>
              )}
              {eventLinks.map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
            </Section>
          )}

          {has('reports') && (
            <Section label="Insights">
              <Link href={`/${orgSlug}/reports`} className={navClass(`/${orgSlug}/reports`)}>
                Reports
              </Link>
            </Section>
          )}

          <div className="px-2 py-3">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300"
              aria-expanded={settingsOpen}
            >
              <span>Settings</span>
              <span>{settingsOpen ? '−' : '+'}</span>
            </button>
            {settingsOpen && (
              <div className="space-y-0.5">
                <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>Members</Link>
                <Link href={`/${orgSlug}/permissions`} className={navClass(`/${orgSlug}/permissions`)}>Permissions</Link>
                <Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>Billing</Link>
                <Link href={`/${orgSlug}/email-domain`} className={navClass(`/${orgSlug}/email-domain`)}>Email domain</Link>
                <Link href={`/${orgSlug}/event-types`} className={navClass(`/${orgSlug}/event-types`)}>Event types</Link>
                <Link href={`/${orgSlug}/departments`} className={navClass(`/${orgSlug}/departments`)}>Departments</Link>
              </div>
            )}
          </div>
        </nav>
      )}

      <div className="mt-auto px-2 py-4 border-t border-gray-700">
        <button
          onClick={handleSignOut}
          className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
