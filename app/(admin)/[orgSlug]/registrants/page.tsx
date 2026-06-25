export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getOrgHouseholds } from '@/actions/households'
import { RegistrantsClient } from '@/components/admin/RegistrantsClient'

export default async function RegistrantsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const households = await getOrgHouseholds(orgSnap.docs[0].id)
  return <RegistrantsClient households={households} />
}
