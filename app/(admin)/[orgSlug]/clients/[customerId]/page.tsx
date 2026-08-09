export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
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

  // The rollup/story is derived in the client from opportunities — no prop for it.
  return (
    <CustomerDetailClient
      orgId={orgId}
      orgSlug={orgSlug}
      customer={customer}
      opportunities={opportunities}
      notes={notes}
    />
  )
}
