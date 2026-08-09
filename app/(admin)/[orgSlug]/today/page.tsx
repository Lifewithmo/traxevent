export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getTodayData, getTodayAgenda } from '@/actions/today'
import { TodayClient } from '@/components/admin/today/TodayClient'

export default async function TodayPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [data, agenda] = await Promise.all([getTodayData(orgId), getTodayAgenda(orgId)])
  return <TodayClient orgId={orgId} orgSlug={orgSlug} data={data} agenda={agenda} />
}
