export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { LeadsBoardClient } from '@/components/admin/LeadsBoardClient'

export default async function LeadsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const leads = await listLeads(orgId)
  return <LeadsBoardClient orgId={orgId} orgSlug={orgSlug} leads={leads} />
}
