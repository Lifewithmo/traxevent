export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCalendarFeed } from '@/actions/calendar'
import { ensureIcsToken } from '@/actions/calendar-sync'
import { weekRange } from '@/lib/calendar'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarWeekClient } from '@/components/admin/calendar/CalendarWeekClient'

export default async function CalendarPage({
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
  const [items, icsToken] = await Promise.all([getCalendarFeed(orgId, orgSlug), ensureIcsToken(orgId)])
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''

  return (
    <CalendarWeekClient
      orgSlug={orgSlug}
      items={items}
      today={today}
      weekFrom={from}
      view={view === 'agenda' ? 'agenda' : 'week'}
      subscribeUrl={`${origin}/ics/${orgSlug}/${icsToken}`}
    />
  )
}
