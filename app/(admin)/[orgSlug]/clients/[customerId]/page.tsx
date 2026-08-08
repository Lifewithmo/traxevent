export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'

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

  const [opportunities, notes] = await Promise.all([
    listCustomerOpportunities(orgId, customerId),
    listNotes(orgId, 'customer', customerId),
  ])

  return (
    <CustomerDetailClient
      orgId={orgId}
      orgSlug={orgSlug}
      customer={customer}
      opportunities={opportunities}
      rollup={rollupCustomer(customer, opportunities)}
      notes={notes}
    />
  )
}
