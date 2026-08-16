export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
import { listActivity } from '@/actions/activity'
import { listInvoicesByCustomerCore } from '@/lib/crm/invoices'
import { mergeActivity } from '@/lib/crm/customer-activity'
import { customerAR } from '@/lib/crm/ar-rollup'
import { ClientCockpit } from '@/components/admin/clients/ClientCockpit'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>
}) {
  const { orgSlug, customerId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const customer = await getCustomer(orgId, customerId)
  if (!customer) notFound()

  const [opportunities, notes, invoices, ownActivity] = await Promise.all([
    listCustomerOpportunities(orgId, customerId),
    listNotes(orgId, 'customer', customerId),
    listInvoicesByCustomerCore(orgId, customerId),
    listActivity(orgId, 'customer', customerId),
  ])
  const leadActivity = await Promise.all(
    opportunities.map((l) => listActivity(orgId, 'opportunity', l.id))
  )
  const activity = mergeActivity([ownActivity, ...leadActivity])
  const ar = customerAR(invoices, new Date())

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
    />
  )
}
