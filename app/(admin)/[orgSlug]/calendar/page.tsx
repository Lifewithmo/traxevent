export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCalendarFeed } from '@/actions/calendar'
import { ensureIcsToken } from '@/actions/calendar-sync'
import { listLeads } from '@/actions/leads'
import { filterFeed, weekRange, PIPELINE_KINDS } from '@/lib/calendar'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarWeekClient } from '@/components/admin/calendar/CalendarWeekClient'
import { CalendarKindFilter } from '@/components/admin/calendar/CalendarKindFilter'

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string; view?: string; kinds?: string }>
}) {
  const [{ orgSlug }, { week, view, kinds }] = await Promise.all([params, searchParams])
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const pipelineOnly = kinds === 'pipeline'

  const today = todayYmd()
  const { from } = weekRange(week ?? today)
  const [feed, icsToken, leads] = await Promise.all([
    getCalendarFeed(orgId, orgSlug),
    ensureIcsToken(orgId),
    pipelineOnly ? listLeads(orgId) : Promise.resolve([]),
  ])
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''

  const items = pipelineOnly ? filterFeed(feed, PIPELINE_KINDS) : feed
  const undated = pipelineOnly
    ? leads.filter((l) => (OPEN_STAGES as (typeof l.stage)[]).includes(l.stage) && !l.event_date).length
    : 0

  return (
    <div className="mx-auto w-full max-w-7xl">
      <CalendarKindFilter orgSlug={orgSlug} active={pipelineOnly ? 'pipeline' : 'all'} week={week} view={view} />
      <CalendarWeekClient
        orgSlug={orgSlug}
        items={items}
        today={today}
        weekFrom={from}
        view={view === 'agenda' ? 'agenda' : 'week'}
        subscribeUrl={`${origin}/ics/${orgSlug}/${icsToken}`}
        footnote={
          pipelineOnly && undated > 0 ? (
            <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              {undated} open opportunit{undated === 1 ? 'y has' : 'ies have'} no date yet — they will not appear on any week.
            </p>
          ) : undefined
        }
      />
    </div>
  )
}
