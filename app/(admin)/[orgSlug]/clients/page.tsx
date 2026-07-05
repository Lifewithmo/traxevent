export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { ClientsTable } from '@/components/admin/ClientsTable'

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const leads = await listLeads(orgSnap.docs[0].id)
  return <ClientsTable orgSlug={orgSlug} leads={leads} />
}
