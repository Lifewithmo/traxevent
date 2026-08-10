export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listCustomers } from '@/actions/customers'
import { listLeads } from '@/actions/leads'
import { ClientsTable } from '@/components/admin/ClientsTable'
import type { Lead } from '@/lib/types'

export default async function ClientsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const [customers, leads] = await Promise.all([listCustomers(orgId), listLeads(orgId)])
  const leadsByCustomerId: Record<string, Lead[]> = {}
  for (const l of leads) {
    if (!l.customer_id) continue
    leadsByCustomerId[l.customer_id] = [...(leadsByCustomerId[l.customer_id] ?? []), l]
  }

  // Grouping/rollup is buildClientList's job — the page just supplies the data.
  return <ClientsTable orgSlug={orgSlug} customers={customers} leadsByCustomerId={leadsByCustomerId} />
}
