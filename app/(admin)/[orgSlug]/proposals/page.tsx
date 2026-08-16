export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllProposals } from '@/actions/proposals'
import { listLeads } from '@/actions/leads'
import { buildProposalLedger } from '@/lib/proposals/ledger'
import { ProposalsKpiBand } from '@/components/admin/proposals/ProposalsKpiBand'
import { ProposalsLedger } from '@/components/admin/proposals/ProposalsLedger'

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
  const rows = proposals.map((p) => ({ ...p, clientName: nameByLead.get(p.lead_id) ?? '' }))
  const ledger = buildProposalLedger(rows, new Date())

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-bold">Proposals</h1>
        <span className="text-sm text-muted-foreground">{ledger.total}</span>
      </div>

      {/* A brand-new org has nothing to roll up; a band of four zeros stacked
          above "No proposals yet" is noise, so the ledger's empty state stands
          alone until there is at least one proposal to summarize. */}
      {ledger.total > 0 && <ProposalsKpiBand tiles={ledger.tiles} />}
      <ProposalsLedger ledger={ledger} orgSlug={orgSlug} />
    </div>
  )
}
