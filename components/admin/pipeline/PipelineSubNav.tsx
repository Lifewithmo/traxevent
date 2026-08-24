import Link from 'next/link'

export type PipelineSubPage = 'opportunities' | 'tasks' | 'capacity'

interface PipelineSubNavProps {
  orgSlug: string
  active: PipelineSubPage
  openCount?: number
  dueTodayCount?: number
  /**
   * Whether to surface the Capacity Outlook tab. Callers gate this on
   * `hasMultiResourceCapacity(org) && ≥1 configured unit` (increment 3) — base
   * and solo orgs never see it. On the outlook page itself it is implicitly
   * true, since the page only renders for a qualifying org.
   */
  showCapacity?: boolean
}

/** 16a: Pipeline is a section, not a page — sub-items sharing one header. */
export function PipelineSubNav({ orgSlug, active, openCount, dueTodayCount, showCapacity }: PipelineSubNavProps) {
  const tabs: Array<{ key: PipelineSubPage; label: string; href: string; badge?: string }> = [
    {
      key: 'opportunities',
      label: 'Opportunities',
      href: `/${orgSlug}/leads`,
      badge: openCount !== undefined ? String(openCount) : undefined,
    },
    {
      key: 'tasks',
      label: 'Tasks',
      href: `/${orgSlug}/leads/tasks`,
      // `dueTodayCount` is everything OWED — `due_date <= today`, overdue
      // included (see leads/page.tsx and leads/tasks/page.tsx). Labelling it
      // "due today" contradicted the tasks page's own "Due today" tile 40px
      // below it, which counts `=== today`: 4 overdue + 1 due today rendered a
      // tab reading "5 due today" above a tile reading "Due today 1".
      badge: dueTodayCount ? `${dueTodayCount} owed` : undefined,
    },
    // The outlook is always the ACTIVE tab on its own page (which only renders
    // for a qualifying org), so it must appear whenever it's active even if a
    // caller forgot to pass the gate.
    ...(showCapacity || active === 'capacity'
      ? [{ key: 'capacity' as const, label: 'Capacity', href: `/${orgSlug}/leads/capacity` }]
      : []),
  ]

  // R8: below `sm` the action slot takes its own full-width line ABOVE the tabs
  // (`order`), so the folder-tab motif stays welded to the bottom border at every
  // width instead of the three portalled controls shoving the tabs off-screen.
  // DOM order stays tabs-then-actions so keyboard order leads with navigation.
  //
  // FRAME (one for the whole Pipeline section). The border rules FULL-BLEED;
  // the content inside it sits in the same `mx-auto max-w-6xl px-6` frame as
  // the KPI band, both opportunity surfaces and the tasks page. This row is
  // where the section's PRIMARY CONTROLS live — both pipeline clients portal
  // "Board view / Intake link / New opportunity" into `#tx-pipeline-actions`
  // below, and that slot is `sm:justify-end` — so leaving it uncapped parked
  // "New opportunity" at x≈1900 on a 1920px monitor while the rows it creates
  // ended at x≈1536, and jumped the left edge ~380px between the two tabs.
  return (
    <div className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-4 gap-y-1 px-6 pt-2">
        <nav
          aria-label="Pipeline sections"
          className="order-2 flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:order-1"
        >
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
        </nav>
        {/*
          SINGULAR portal target. Both PipelineListClient and PipelineBoardView
          createPortal into `#tx-pipeline-actions`; duplicate it or drop it and
          their buttons disappear silently, with no error anywhere.
        */}
        <div
          id="tx-pipeline-actions"
          className="order-1 flex w-full flex-wrap items-center gap-2 pb-1.5 sm:order-2 sm:w-auto sm:justify-end sm:pb-2"
        />
      </div>
    </div>
  )
}
