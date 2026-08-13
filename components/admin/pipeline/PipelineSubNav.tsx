import Link from 'next/link'

export type PipelineSubPage = 'opportunities' | 'calendar' | 'tasks'

interface PipelineSubNavProps {
  orgSlug: string
  active: PipelineSubPage
  openCount?: number
  dueTodayCount?: number
}

/** 16a: Pipeline is a section, not a page — three sub-items sharing one header. */
export function PipelineSubNav({ orgSlug, active, openCount, dueTodayCount }: PipelineSubNavProps) {
  const tabs: Array<{ key: PipelineSubPage; label: string; href: string; badge?: string }> = [
    {
      key: 'opportunities',
      label: 'Opportunities',
      href: `/${orgSlug}/leads`,
      badge: openCount !== undefined ? String(openCount) : undefined,
    },
    { key: 'calendar', label: 'Calendar', href: `/${orgSlug}/leads/calendar` },
    {
      key: 'tasks',
      label: 'Tasks',
      href: `/${orgSlug}/leads/tasks`,
      badge: dueTodayCount ? `${dueTodayCount} due today` : undefined,
    },
  ]

  return (
    <nav aria-label="Pipeline sections" className="flex items-center gap-1 border-b border-border px-5 pt-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={[
            'flex items-center gap-1.5 rounded-t px-3 py-1.5 text-sm',
            t.key === active
              ? 'border border-b-0 border-border bg-background font-semibold'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {t.label}
          {t.badge && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t.badge}
            </span>
          )}
        </Link>
      ))}
      <div id="tx-pipeline-actions" className="ml-auto flex items-center gap-2" />
    </nav>
  )
}
