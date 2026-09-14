export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
import { listActivity } from '@/actions/activity'
import { listInvoicesByCustomerCore } from '@/lib/crm/invoices'
import { mergeActivity } from '@/lib/crm/customer-activity'
import { customerAR } from '@/lib/crm/ar-rollup'
import { buildEventTypeOptions } from '@/lib/crm/event-type-options'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { ClientCockpit } from '@/components/admin/clients/ClientCockpit'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>
}) {
  const { orgSlug, customerId } = await params
  // requireOrgMember (was a raw slug query): same org read + notFound, and it
  // also resolves the MEMBER — the create form's inline event-type create is
  // owner/admin only (event types inc 1), decided server-side.
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const plan = org.plan
  const eventTypeProfiles = org.event_type_profiles
  const canCreateEventTypes = member.role === 'owner' || member.role === 'admin'

  const customer = await getCustomer(orgId, customerId)
  if (!customer) notFound()

  const [opportunities, notes, invoices, ownActivity, units] = await Promise.all([
    listCustomerOpportunities(orgId, customerId),
    listNotes(orgId, 'customer', customerId),
    listInvoicesByCustomerCore(orgId, customerId),
    listActivity(orgId, 'customer', customerId),
    // Same gate + backstop as the pipeline page: only a business-tier org can
    // have units, so everyone else pays no read and gets no delivery toggle.
    hasMultiResourceCapacity({ plan }) ? listCapacityUnitsCore(orgId) : Promise.resolve([]),
  ])
  const leadActivity = await Promise.all(
    opportunities.map((l) => listActivity(orgId, 'opportunity', l.id))
  )
  const activity = mergeActivity([ownActivity, ...leadActivity])
  const ar = customerAR(invoices, new Date())

  // The delivery-mode toggle needs a room to host in: ≥1 ACTIVE venue unit —
  // the same rule the pipeline page threads to its create form.
  const showDeliveryMode = units.some((u) => u.kind === 'venue' && u.active)
  // Chip vocabulary: profiles + THIS customer's own history (one shared rule,
  // lib/crm/event-type-options — the pipeline page feeds it the whole org's).
  // The form's profile matching (hint, delivery-mode hiding, event_type_id)
  // runs against the org profile array threaded below. (The cockpit's
  // pastJobCounts is derived in ClientCockpit from the pinned customer's own
  // opportunities — no extra prop.)
  const eventTypeOptions = buildEventTypeOptions(eventTypeProfiles, opportunities)

  // The rollup/story is derived in the client from opportunities — no prop for it.
  return (
    <ClientCockpit
      orgId={orgId}
      orgSlug={orgSlug}
      customer={customer}
      opportunities={opportunities}
      notes={notes}
      invoices={invoices}
      activity={activity}
      ar={ar}
      showDeliveryMode={showDeliveryMode}
      eventTypeOptions={eventTypeOptions}
      eventTypeProfiles={eventTypeProfiles}
      canCreateEventTypes={canCreateEventTypes}
      resourceLabels={org.resource_labels}
    />
  )
}
