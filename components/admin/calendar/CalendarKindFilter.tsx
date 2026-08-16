import { TabLinks, type TabLink } from '@/components/ui/tab-links'

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

  const tabs: TabLink[] = [
    { key: 'all', label: 'Everything', href: href() },
    { key: 'pipeline', label: 'Pipeline only', href: href('pipeline') },
  ]

  return <TabLinks tabs={tabs} active={active} ariaLabel="Calendar filter" className="mx-5 mt-3" />
}
