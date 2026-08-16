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
    <div className="flex flex-col">
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
