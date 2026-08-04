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
    <div className="flex flex-col h-screen">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900">Families</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {families.length} registration{families.length !== 1 ? 's' : ''}
        </p>
      </div>
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
