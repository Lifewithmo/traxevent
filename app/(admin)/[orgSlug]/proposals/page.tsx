export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllProposals } from '@/actions/proposals'
import { listLeads } from '@/actions/leads'
import { AllProposalsTable, type ProposalRow } from '@/components/admin/AllProposalsTable'

export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [proposals, leads] = await Promise.all([listAllProposals(orgId), listLeads(orgId)])
  const nameByLead = new Map<string, string>(leads.map((l) => [l.id, l.name]))
  const rows: ProposalRow[] = proposals.map((p) => ({ ...p, clientName: nameByLead.get(p.lead_id) ?? '' }))
  return <AllProposalsTable orgSlug={orgSlug} rows={rows} />
}
