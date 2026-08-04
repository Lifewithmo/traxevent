export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { listItinerary } from '@/actions/itinerary'
import { ItineraryClient } from '@/components/admin/ItineraryClient'

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, campSlug, 'itinerary')
  const items = await listItinerary(orgId, eventId)

  return (
    <ItineraryClient
      orgId={orgId}
      eventId={eventId}
      items={items}
      published={event.itinerary_published ?? false}
    />
  )
}
