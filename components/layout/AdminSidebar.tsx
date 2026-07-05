'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import { endSession } from '@/lib/auth/establish-session'
import type { Terminology } from '@/lib/event-types'
import type { CampPage } from '@/lib/types'

interface AdminSidebarProps {
  orgSlug: string
  campSlug?: string
  terminology?: Terminology
  allowedCampPages?: CampPage[]
}

const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'leads', 'clients', 'proposals',
  'contracts', 'invoices', 'vendors', 'calendar', 'new-camp',
])

function getCampNav(terminology: Terminology) {
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

const SETTINGS_SLUGS = ['members', 'permissions', 'billing', 'email-domain', 'event-types', 'departments']

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-3">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function AdminSidebar({ orgSlug, campSlug, terminology, allowedCampPages }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Hooks must run unconditionally before any early return (rules of hooks).
  const settingsActive = SETTINGS_SLUGS.some(
    (s) => pathname === `/${orgSlug}/${s}` || pathname.startsWith(`/${orgSlug}/${s}/`)
  )
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  // Rendered by BOTH the org layout (no campSlug) and the camp layout (with campSlug).
  // On a camp route the camp layout renders the contextual event sidebar, so the
  // org-layout instance hides itself to avoid a doubled sidebar.
  if (!campSlug) {
    const seg = pathname.split('/').filter(Boolean)
    if (seg.length >= 2 && !ORG_PAGE_SLUGS.has(seg[1])) return null
  }

  const t = terminology ?? DEFAULT_TERMINOLOGY
  const campNav = getCampNav(t)
  const visibleCampNav = allowedCampPages
    ? campNav.filter(
        (n) =>
          n.key === 'dashboard' ||
          n.key === 'settings' ||
          allowedCampPages.includes(n.key as CampPage)
      )
    : campNav

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

      {campSlug ? (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Event navigation">
          <Link
            href={`/${orgSlug}`}
            className="block px-3 py-2 rounded-md text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            &larr; Events
          </Link>
          {visibleCampNav.map(({ key, label }) => {
            const href = `/${orgSlug}/${campSlug}/${key}`
            return (
              <Link key={key} href={href} className={navClass(href)}>
                {label}
              </Link>
            )
          })}
        </nav>
      ) : (
        <nav className="flex-1" aria-label="Workspace navigation">
          <Section label="Sales">
            <Link href={`/${orgSlug}/leads`} className={navClass(`/${orgSlug}/leads`)}>
              Pipeline
            </Link>
            <Link href={`/${orgSlug}/clients`} className={navClass(`/${orgSlug}/clients`)}>
              Clients
            </Link>
            <Link href={`/${orgSlug}/proposals`} className={navClass(`/${orgSlug}/proposals`)}>
              Proposals
            </Link>
            <Link href={`/${orgSlug}/contracts`} className={navClass(`/${orgSlug}/contracts`)}>
              Contracts
            </Link>
            <Link href={`/${orgSlug}/invoices`} className={navClass(`/${orgSlug}/invoices`)}>
              Invoices
            </Link>
          </Section>

          <Section label="Events">
            <Link href={`/${orgSlug}`} className={exactNavClass(`/${orgSlug}`)}>
              Events
            </Link>
            <Link href={`/${orgSlug}/registrants`} className={navClass(`/${orgSlug}/registrants`)}>
              Registrants
            </Link>
            <Link href={`/${orgSlug}/vendors`} className={navClass(`/${orgSlug}/vendors`)}>
              Vendors
            </Link>
            <Link href={`/${orgSlug}/calendar`} className={navClass(`/${orgSlug}/calendar`)}>
              Calendar
            </Link>
          </Section>

          <Section label="Insights">
            <Link href={`/${orgSlug}/reports`} className={navClass(`/${orgSlug}/reports`)}>
              Reports
            </Link>
          </Section>

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
                <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>
                  Members
                </Link>
                <Link href={`/${orgSlug}/permissions`} className={navClass(`/${orgSlug}/permissions`)}>
                  Permissions
                </Link>
                <Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>
                  Billing
                </Link>
                <Link href={`/${orgSlug}/email-domain`} className={navClass(`/${orgSlug}/email-domain`)}>
                  Email domain
                </Link>
                <Link href={`/${orgSlug}/event-types`} className={navClass(`/${orgSlug}/event-types`)}>
                  Event types
                </Link>
                <Link href={`/${orgSlug}/departments`} className={navClass(`/${orgSlug}/departments`)}>
                  Departments
                </Link>
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
