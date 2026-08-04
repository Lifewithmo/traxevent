export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import { resolveTerminology } from '@/lib/event-types'
import { CheckinClient } from '@/components/admin/CheckinClient'

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { date } = await searchParams
  const { orgId, eventId, event } = await requireEventPage(orgSlug, campSlug, 'checkin')

  const today = new Date().toISOString().slice(0, 10)
  const activeDate = date ?? today

  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, eventId),
    getCheckinsForDate(orgId, eventId, activeDate),
  ])

  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)
  const guardianMode = event.registration_type === 'child'

  return (
    <CheckinClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      campSlug={campSlug}
      date={activeDate}
      members={members}
      checkins={checkins}
      guardianMode={guardianMode}
      memberLabel={terminology.memberPlural}
    />
  )
}
