export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import { resolveTerminology } from '@/lib/event-types'
import { CheckinClient } from '@/components/admin/CheckinClient'

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { date } = await searchParams
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'checkin')

  const today = new Date().toISOString().slice(0, 10)
  const activeDate = date ?? today

  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, eventId),
    getCheckinsForDate(orgId, eventId, activeDate),
  ])

  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)
  const guardianMode = (event.registration_type ?? 'individual') === 'child'

  return (
    // Keyed by date: changing the date remounts the client, resetting local
    // checkin state, row phases, and any open undo window to the new day's data.
    <CheckinClient
      key={activeDate}
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      date={activeDate}
      members={members}
      checkins={checkins}
      guardianMode={guardianMode}
      memberLabel={terminology.memberPlural}
    />
  )
}
