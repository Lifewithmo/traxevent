export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { getCustomer } from '@/actions/customers'
import { listTasks } from '@/actions/tasks'
import { listActivity } from '@/actions/activity'
import { listProposals } from '@/actions/proposals'
import { listInvoices } from '@/actions/invoices'
import { listContracts } from '@/actions/contracts'
import { listVendors } from '@/actions/vendors'
import { listEventsByLead } from '@/actions/events'
import { listOrgEventTypes } from '@/actions/event-types'
import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadContractsClient } from '@/components/admin/LeadContractsClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import { ClientPortalLinkClient } from '@/components/admin/ClientPortalLinkClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()

  const [customer, tasks, activity, proposals, invoices, contracts, vendors, jobs, eventTypes] = await Promise.all([
    lead.customer_id ? getCustomer(orgId, lead.customer_id) : Promise.resolve(null),
    listTasks(orgId, leadId),
    listActivity(orgId, 'opportunity', leadId),
    listProposals(orgId, leadId),
    listInvoices(orgId, leadId),
    listContracts(orgId, leadId),
    listVendors(orgId, leadId),
    listEventsByLead(orgId, leadId),
    listOrgEventTypes(orgId),
  ])

  const acceptedProposals = proposals
    .filter((p) => p.status === 'accepted')
    .map((p) => ({ id: p.id, title: p.title }))

  return (
    <>
      <OpportunityDetailClient
        orgId={orgId}
        orgSlug={orgSlug}
        lead={lead}
        customer={customer}
        tasks={tasks}
        activity={activity}
        job={jobs[0] ?? null}
        eventTypes={eventTypes}
      />

      <div className="mx-auto max-w-5xl space-y-4 px-6 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Attachments</h2>
        <AttachmentChips proposals={proposals} invoices={invoices} contracts={contracts} vendors={vendors} />
      </div>

      <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />
      <LeadInvoicesClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoices={invoices} acceptedProposals={acceptedProposals} />
      <LeadContractsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contracts={contracts} />
      <LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />
      <ClientPortalLinkClient orgId={orgId} leadId={leadId} />
    </>
  )
}
