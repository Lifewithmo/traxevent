'use client'

// Section tabs for the event spine — same route-tab idiom as PipelineSubNav.
// Items come pre-built from the layout via buildEventNav, so the tab row and
// the sidebar's Events section always agree on gating and labels.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { EventNavItem } from '@/lib/event-nav'

interface EventSubNavProps {
  orgSlug: string
  eventSlug: string
  items: EventNavItem[]
}

export function EventSubNav({ orgSlug, eventSlug, items }: EventSubNavProps) {
  const pathname = usePathname()

  // Active = the path segment right after the eventSlug matches the item key;
  // the bare event root (no segment) counts as dashboard.
  const seg = pathname.split('/').filter(Boolean)
  const slugIdx = seg.indexOf(eventSlug)
  const activeKey = slugIdx >= 0 ? (seg[slugIdx + 1] ?? 'dashboard') : 'dashboard'

  return (
    <nav
      aria-label="Event sections"
      className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-border px-5 pt-2 print:hidden"
    >
      {items.map((t) => (
        <Link
          key={t.key}
          href={`/${orgSlug}/${eventSlug}/${t.key}`}
          aria-current={t.key === activeKey ? 'page' : undefined}
          className={[
            'shrink-0 rounded-t px-3 py-1.5 text-sm',
            t.key === activeKey
              ? 'border border-b-0 border-border bg-background font-semibold'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
