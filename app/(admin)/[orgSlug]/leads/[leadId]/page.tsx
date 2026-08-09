export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { convertBlockReason, todayYmd } from '@/lib/opportunity-detail'
import { windowDays } from '@/lib/date-window'
import { listTasks } from '@/actions/tasks'
import { listActivity } from '@/actions/activity'
import { listProposals } from '@/actions/proposals'
import { listInvoices } from '@/actions/invoices'
import { listContracts } from '@/actions/contracts'
import { listVendors } from '@/actions/vendors'
import { listEventsByLead } from '@/actions/events'
import { listOrgEventTypes } from '@/actions/event-types'
import { listCalendarRange } from '@/actions/calendar'
import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import { ClientPortalLinkClient } from '@/components/admin/ClientPortalLinkClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()

  const today = todayYmd()
  const center = lead.event_date ?? today
  const win = windowDays(center)

  const [customer, tasks, activity, proposals, invoices, contracts, vendors, jobs, eventTypes, customerLeads, calendarItems] = await Promise.all([
    lead.customer_id ? getCustomer(orgId, lead.customer_id) : Promise.resolve(null),
    listTasks(orgId, leadId),
    listActivity(orgId, 'opportunity', leadId),
    listProposals(orgId, leadId),
    listInvoices(orgId, leadId),
    listContracts(orgId, leadId),
    listVendors(orgId, leadId),
    listEventsByLead(orgId, leadId),
    listOrgEventTypes(orgId),
    lead.customer_id ? listCustomerOpportunities(orgId, lead.customer_id) : Promise.resolve([]),
    listCalendarRange(orgId, orgSlug, win[0], win[9]),
  ])

  const acceptedProposals = proposals
    .filter((p) => p.status === 'accepted')
    .map((p) => ({ id: p.id, title: p.title ?? '' }))

  const pastBookings = customerLeads.filter((l) => l.stage === 'closed_won' && l.id !== lead.id).length
  const blockReason = convertBlockReason({
    stage: lead.stage,
    proposals,
    contracts,
    guestCount: lead.guest_count,
  }).message

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
        proposals={proposals}
        invoices={invoices}
        contracts={contracts}
        vendors={vendors}
        acceptedProposals={acceptedProposals}
        pastBookings={pastBookings}
        convertBlockReason={blockReason}
        today={today}
        calendarItems={calendarItems}
      />

      <ClientPortalLinkClient orgId={orgId} leadId={leadId} />
    </>
  )
}
