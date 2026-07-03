export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { listProposals } from '@/actions/proposals'
import { listInvoices } from '@/actions/invoices'
import { LeadDetailClient } from '@/components/admin/LeadDetailClient'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { ClientPortalLinkClient } from '@/components/admin/ClientPortalLinkClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()
  const proposals = await listProposals(orgId, leadId)
  const invoices = await listInvoices(orgId, leadId)
  return (
    <>
      <LeadDetailClient orgId={orgId} orgSlug={orgSlug} lead={lead} />
      <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />
      <LeadInvoicesClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoices={invoices} />
      <ClientPortalLinkClient orgId={orgId} leadId={leadId} />
    </>
  )
}
