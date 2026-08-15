import Link from 'next/link'

interface CalendarKindFilterProps {
  orgSlug: string
  active: 'all' | 'pipeline'
  week?: string
  view?: string
}

/** URL-driven filter for the one calendar: everything, or pipeline work only. */
export function CalendarKindFilter({ orgSlug, active, week, view }: CalendarKindFilterProps) {
  const href = (kinds?: 'pipeline') => {
    const p = new URLSearchParams()
    if (kinds) p.set('kinds', kinds)
    if (week) p.set('week', week)
    if (view) p.set('view', view)
    const q = p.toString()
    return `/${orgSlug}/calendar${q ? `?${q}` : ''}`
  }

  const tabs: Array<{ key: 'all' | 'pipeline'; label: string; href: string }> = [
    { key: 'all', label: 'Everything', href: href() },
    { key: 'pipeline', label: 'Pipeline only', href: href('pipeline') },
  ]

  return (
    <nav aria-label="Calendar filter" className="flex items-center gap-4 px-5 pt-3 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={t.key === active ? 'font-semibold' : 'text-muted-foreground hover:text-foreground'}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
