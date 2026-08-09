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
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'

export default async function PipelineCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string; view?: string }>
}) {
  const [{ orgSlug }, { week, view }] = await Promise.all([params, searchParams])
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const today = todayYmd()
  const { from } = weekRange(week ?? today)
  const [feed, leads, icsToken] = await Promise.all([
    getCalendarFeed(orgId, orgSlug),
    listLeads(orgId),
    ensureIcsToken(orgId),
  ])
  // Pipeline work only — booked events, compliance, and invoices live on the Events calendar.
  const items = filterFeed(feed, PIPELINE_KINDS)
  const open = leads.filter((l) => (OPEN_STAGES as (typeof l.stage)[]).includes(l.stage))
  const undated = open.filter((l) => !l.event_date).length
  const dueToday = items.filter((i) => i.kind === 'task' && i.date.slice(0, 10) <= today).length
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''

  return (
    <div>
      <PipelineSubNav orgSlug={orgSlug} active="calendar" openCount={open.length} dueTodayCount={dueToday} />
      <CalendarWeekClient
        orgSlug={orgSlug}
        items={items}
        today={today}
        weekFrom={from}
        view={view === 'agenda' ? 'agenda' : 'week'}
        subscribeUrl={`${origin}/ics/${orgSlug}/${icsToken}?include=${PIPELINE_KINDS.join(',')}`}
        basePath={`/${orgSlug}/leads/calendar`}
        footnote={
          <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
            Pipeline dates only — booked events live on the{' '}
            <a href={`/${orgSlug}/calendar`} className="underline">
              Events calendar
            </a>
            .
            {undated > 0 && (
              <span className="ml-2">
                {undated} {undated === 1 ? 'opportunity has' : 'opportunities have'} no date at all
              </span>
            )}
          </p>
        }
      />
    </div>
  )
}
