export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getAdminFamilies } from '@/actions/admin-families'
import { FamiliesClient } from '@/components/admin/FamiliesClient'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb
    .collection('orgs')
    .where('slug', '==', orgSlug)
    .limit(1)
    .get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .where('slug', '==', campSlug)
    .limit(1)
    .get()
  if (campSnap.empty) notFound()
  const campId = campSnap.docs[0].id

  return { orgId, campId }
}

export default async function FamiliesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await resolveIds(orgSlug, campSlug)
  const families = await getAdminFamilies(orgId, campId)

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
            campId={campId}
          />
        </Suspense>
      </div>
    </div>
  )
}
