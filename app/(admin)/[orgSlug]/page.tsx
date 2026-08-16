import { getOrgBySlug } from '@/actions/orgs'
import { listEvents } from '@/actions/events'
import { listDepartments } from '@/actions/departments'
import { listSeries } from '@/actions/series'
import { kindOf } from '@/lib/occasions/kind'
import { EVENT_STATUS_TONE, EVENT_STATUS_LABEL, formatEventDateRange } from '@/lib/event-ui'
import { todayYmd } from '@/lib/opportunity-detail'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { DuplicateEventMenu } from '@/components/admin/DuplicateEventButton'
import { CalendarDays } from 'lucide-react'
import Link from 'next/link'

const SECTION_HEADING = 'mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'

export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  if (!org) redirect('/login')

  const [events, departments, seriesList] = await Promise.all([
    listEvents(org.id),
    listDepartments(org.id),
    listSeries(org.id),
  ])

  const clientJobs = events.filter((e) => kindOf(e) === 'client_job')
  const marketDays = events.filter((e) => kindOf(e) === 'market_day')

  const today = todayYmd()
  const upcoming = events.filter((e) => e.status !== 'archived' && e.event_start >= today)
  const nextStart = upcoming.length > 0
    ? upcoming.reduce((min, e) => (e.event_start < min ? e.event_start : min), upcoming[0].event_start)
    : null
  const guestsExpected = upcoming.reduce((sum, e) => sum + (e.headcount ?? 0), 0)

  const renderRow = (event: (typeof events)[number], showYear: boolean) => {
    const meta = [
      formatEventDateRange(event.event_start, event.event_end),
      event.headcount ? `${event.headcount} guests` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    // Stretched-link row: the container is the hover/hit surface, the Link's
    // after-overlay makes the whole row navigate, and the menu sits above the
    // overlay as a sibling so it receives its own clicks (never nested in the
    // anchor).
    return (
      <div
        key={event.id}
        className="relative flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50"
      >
        <Link
          href={`/${orgSlug}/${event.slug}/dashboard`}
          className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.name}</span>
          <StatusPill tone={EVENT_STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</StatusPill>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{meta}</span>
          {showYear && <Badge variant="outline">{event.year}</Badge>}
        </Link>
        <DuplicateEventMenu orgId={org.id} orgSlug={orgSlug} sourceEventId={event.id} sourceName={event.name} />
      </div>
    )
  }

  // Chronological within each group (fetch order is created_at); the year chip
  // appears only when a group spans multiple years and so needs disambiguating.
  const renderGroup = (groupEvents: typeof events) => {
    const sorted = [...groupEvents].sort((a, b) => a.event_start.localeCompare(b.event_start))
    const showYear = new Set(sorted.map((e) => e.year)).size > 1
    return (
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {sorted.map((e) => renderRow(e, showYear))}
      </div>
    )
  }

  const unassigned = clientJobs.filter((c) => !c.department_id || !departments.some((d) => d.id === c.department_id))
  const standalone = marketDays.filter((e) => !e.series_id)

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Events</h1>
          <p className="text-xs text-muted-foreground">
            {clientJobs.length} client job{clientJobs.length === 1 ? '' : 's'}
            {' · '}
            {marketDays.length} market day{marketDays.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button render={<Link href={`/${orgSlug}/new`} />}>New event</Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<CalendarDays />}
          title="No events yet"
          description="Create your first event to get started."
          action={<Button render={<Link href={`/${orgSlug}/new`} />}>Create an event</Button>}
        />
      ) : (
        <>
          <div className="px-5 pt-4">
            <KpiBand>
              <StatTile
                label="Upcoming"
                value={String(upcoming.length)}
                note={nextStart ? formatEventDateRange(nextStart) : undefined}
              />
              <StatTile label="Client jobs" value={String(clientJobs.length)} />
              <StatTile label="Market days" value={String(marketDays.length)} />
              <StatTile
                label="Guests expected"
                value={String(guestsExpected)}
                note="across upcoming events"
              />
            </KpiBand>
          </div>

          <div className="space-y-8 px-5 py-5">
            {clientJobs.length > 0 && (
              <section>
                <h2 className={SECTION_HEADING}>Client jobs</h2>
                {departments.length === 0 ? (
                  renderGroup(clientJobs)
                ) : (
                  <div className="space-y-6">
                    {departments.map((dept) => {
                      const deptEvents = clientJobs.filter((c) => c.department_id === dept.id)
                      if (deptEvents.length === 0) return null
                      return (
                        <section key={dept.id}>
                          <h2 className={SECTION_HEADING}>{dept.name}</h2>
                          {renderGroup(deptEvents)}
                        </section>
                      )
                    })}
                    {unassigned.length > 0 && (
                      <section>
                        <h2 className={SECTION_HEADING}>Unassigned</h2>
                        {renderGroup(unassigned)}
                      </section>
                    )}
                  </div>
                )}
              </section>
            )}

            {marketDays.length > 0 && (
              <section>
                <h2 className={SECTION_HEADING}>Market days</h2>
                <div className="space-y-6">
                  {seriesList.map((s) => {
                    const seriesDays = marketDays.filter((e) => e.series_id === s.id)
                    if (seriesDays.length === 0) return null
                    return (
                      <div key={s.id}>
                        <Link
                          href={`/${orgSlug}/series/${s.id}`}
                          className={`${SECTION_HEADING} block hover:text-foreground`}
                        >
                          {s.name}
                        </Link>
                        {renderGroup(seriesDays)}
                      </div>
                    )
                  })}
                  {standalone.length > 0 && renderGroup(standalone)}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
