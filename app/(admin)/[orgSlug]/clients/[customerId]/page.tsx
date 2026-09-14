export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
import { listActivity } from '@/actions/activity'
import { listInvoicesByCustomerCore } from '@/lib/crm/invoices'
import { mergeActivity } from '@/lib/crm/customer-activity'
import { customerAR } from '@/lib/crm/ar-rollup'
import { buildEventTypeOptions, eventTypeProfileNames } from '@/lib/crm/event-type-options'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { ClientCockpit } from '@/components/admin/clients/ClientCockpit'
import type { BillingPlan, Org } from '@/lib/types'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>
}) {
  const { orgSlug, customerId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  // Org doc fields the create form needs (New Opportunity inc 1) — this page
  // was already paying for the whole document in the slug lookup above and
  // discarding everything but the id.
  const orgData = orgSnap.docs[0].data()
  const plan = orgData.plan as BillingPlan | undefined
  const eventTypeProfiles = orgData.event_type_profiles as Org['event_type_profiles']

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
  const eventTypeOptions = buildEventTypeOptions(eventTypeProfiles, opportunities)
  // C5b: the RAW profile vocabulary, independent of the merged chip list —
  // the form keys its "not a configured event type" hint on this. (The
  // cockpit's pastJobCounts is derived in ClientCockpit from the pinned
  // customer's own opportunities — no extra prop.)
  const profileNames = eventTypeProfileNames(eventTypeProfiles)

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
      eventTypeProfileNames={profileNames}
    />
  )
}
