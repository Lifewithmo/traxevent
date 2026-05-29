'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminSidebarProps {
  orgSlug: string
  campSlug?: string
}

const CAMP_NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'families', label: 'Families' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'teams', label: 'Teams' },
  { key: 'budget', label: 'Budget' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'communicate', label: 'Communicate' },
  { key: 'reports', label: 'Reports' },
]

export function AdminSidebar({ orgSlug, campSlug }: AdminSidebarProps) {
  const pathname = usePathname()

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
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Camp navigation">
          {CAMP_NAV.map(({ key, label }) => {
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
        <Link href={`/${orgSlug}/settings`} className={navClass(`/${orgSlug}/settings`)}>
          Settings
        </Link>
      </div>
    </aside>
  )
}
