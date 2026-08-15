import { getOrgBySlug } from '@/actions/orgs'
import { DEFAULT_EVENT_TYPE_ID, resolveTerminology } from '@/lib/event-types'
import { listEvents } from '@/actions/events'
import { listDepartments } from '@/actions/departments'
import { listSeries } from '@/actions/series'
import { kindOf, EVENT_KIND_LABELS } from '@/lib/occasions/kind'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DuplicateEventButton } from '@/components/admin/DuplicateEventButton'
import Link from 'next/link'

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

  const renderCard = (event: typeof events[number]) => (
    <Card key={event.id} className="hover:shadow-md transition-shadow h-full flex flex-col">
      <Link href={`/${orgSlug}/${event.slug}/dashboard`} className="block cursor-pointer">
        <CardHeader>
          <CardTitle className="text-base">{event.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{event.year}</Badge>
            <Badge variant={event.status === 'active' ? 'default' : 'secondary'}>
              {event.status}
            </Badge>
            <Badge variant="outline">{resolveTerminology(event.event_type_id ?? DEFAULT_EVENT_TYPE_ID, event.event_type_terminology).eventLabel}</Badge>
            <Badge variant="outline">{EVENT_KIND_LABELS[kindOf(event)]}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {event.event_start} → {event.event_end}
          </p>
        </CardContent>
      </Link>
      <CardContent className="pt-0 mt-auto">
        <DuplicateEventButton orgId={org.id} orgSlug={orgSlug} sourceEventId={event.id} sourceName={event.name} />
      </CardContent>
    </Card>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <Link href={`/${orgSlug}/new`}>
          <Button>New event</Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No events yet</p>
          <p className="mt-1 text-sm">Create your first event to get started.</p>
          <Link href={`/${orgSlug}/new`} className="mt-4 inline-block">
            <Button>Create an event</Button>
          </Link>
        </div>
      ) : (
        <>
          {clientJobs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Client jobs</h2>
              {departments.length === 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {clientJobs.map(renderCard)}
                </div>
              ) : (
                <div className="space-y-8">
                  {departments.map((dept) => {
                    const deptEvents = clientJobs.filter((c) => c.department_id === dept.id)
                    if (deptEvents.length === 0) return null
                    return (
                      <section key={dept.id}>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{dept.name}</h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{deptEvents.map(renderCard)}</div>
                      </section>
                    )
                  })}
                  {(() => {
                    const unassigned = clientJobs.filter((c) => !c.department_id || !departments.some((d) => d.id === c.department_id))
                    if (unassigned.length === 0) return null
                    return (
                      <section>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Unassigned</h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{unassigned.map(renderCard)}</div>
                      </section>
                    )
                  })()}
                </div>
              )}
            </section>
          )}
          {marketDays.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Market days</h2>
              {seriesList.map((s) => {
                const seriesDays = marketDays.filter((e) => e.series_id === s.id)
                if (seriesDays.length === 0) return null
                return (
                  <div key={s.id} className="mb-6">
                    <Link href={`/${orgSlug}/series/${s.id}`} className="text-sm font-medium underline">{s.name}</Link>
                    <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{seriesDays.map(renderCard)}</div>
                  </div>
                )
              })}
              {(() => {
                const standalone = marketDays.filter((e) => !e.series_id)
                if (standalone.length === 0) return null
                return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{standalone.map(renderCard)}</div>
              })()}
            </section>
          )}
        </>
      )}
    </div>
  )
}
