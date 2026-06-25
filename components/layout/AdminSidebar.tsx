'use client'

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

export function AdminSidebar({ orgSlug, campSlug, terminology, allowedCampPages }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
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

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <Link href={`/${orgSlug}`} className="font-bold text-white text-lg tracking-tight">
          TraxEvent
        </Link>
      </div>

      {campSlug && (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Event navigation">
          {visibleCampNav.map(({ key, label }) => {
            const href = `/${orgSlug}/${campSlug}/${key}`
            return (
              <Link key={key} href={href} className={navClass(href)}>
                {label}
              </Link>
            )
          })}
        </nav>
      )}

      <div className="px-2 py-4 border-t border-gray-700 space-y-0.5">
        <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>
          Members
        </Link>
        <Link href={`/${orgSlug}/forms`} className={navClass(`/${orgSlug}/forms`)}>
          Form Templates
        </Link>
        <Link href={`/${orgSlug}/permissions`} className={navClass(`/${orgSlug}/permissions`)}>
          Permissions
        </Link>
        <Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>
          Billing
        </Link>
        <Link href={`/${orgSlug}/email-domain`} className={navClass(`/${orgSlug}/email-domain`)}>
          Email Domain
        </Link>
        <Link href={`/${orgSlug}/event-types`} className={navClass(`/${orgSlug}/event-types`)}>
          Event Types
        </Link>
        <Link href={`/${orgSlug}/departments`} className={navClass(`/${orgSlug}/departments`)}>
          Departments
        </Link>
        <Link href={`/${orgSlug}/reports`} className={navClass(`/${orgSlug}/reports`)}>
          Reports
        </Link>
        <Link href={`/${orgSlug}/registrants`} className={navClass(`/${orgSlug}/registrants`)}>
          Registrants
        </Link>
        <Link href={`/${orgSlug}/leads`} className={navClass(`/${orgSlug}/leads`)}>
          Pipeline
        </Link>
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
