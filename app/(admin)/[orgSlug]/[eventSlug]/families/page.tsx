export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requireEventPage } from '@/lib/auth/guards'
import { getAdminFamilies } from '@/actions/admin-families'
import { FamiliesClient } from '@/components/admin/FamiliesClient'

export default async function FamiliesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId } = await requireEventPage(orgSlug, eventSlug, 'families')
  const families = await getAdminFamilies(orgId, eventId)

  return (
    // Same p-5 gutter as the sibling event leaves (top spacing comes from the
    // spine band above), so the table no longer runs edge-to-edge.
    <div className="flex flex-col px-5 pb-5">
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <FamiliesClient
            families={families}
            orgId={orgId}
            eventId={eventId}
          />
        </Suspense>
      </div>
    </div>
  )
}
