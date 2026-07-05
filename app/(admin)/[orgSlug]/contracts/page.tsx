export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllContracts } from '@/actions/contracts'
import { listLeads } from '@/actions/leads'
import { AllContractsTable, type ContractRow } from '@/components/admin/AllContractsTable'

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [contracts, leads] = await Promise.all([listAllContracts(orgId), listLeads(orgId)])
  const nameByLead = new Map<string, string>(leads.map((l) => [l.id, l.name]))
  const rows: ContractRow[] = contracts.map((c) => ({ ...c, clientName: nameByLead.get(c.lead_id) ?? '' }))
  return <AllContractsTable orgSlug={orgSlug} rows={rows} />
}
