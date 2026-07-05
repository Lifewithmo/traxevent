export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getOrgCalendar } from '@/actions/calendar'
import { CalendarView } from '@/components/admin/CalendarView'

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const items = await getOrgCalendar(orgId, orgSlug)
  return <CalendarView items={items} />
}
