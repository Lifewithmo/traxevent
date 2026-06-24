export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { listItinerary } from '@/actions/itinerary'
import { ItineraryClient } from '@/components/admin/ItineraryClient'

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'itinerary')
  const items = await listItinerary(orgId, campId)

  return (
    <ItineraryClient
      orgId={orgId}
      campId={campId}
      items={items}
      published={camp.itinerary_published ?? false}
    />
  )
}
