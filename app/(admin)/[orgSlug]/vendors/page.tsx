export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllVendors } from '@/actions/vendors'
import { listLeads } from '@/actions/leads'
import { AllVendorsTable, type VendorRow } from '@/components/admin/AllVendorsTable'

export default async function VendorsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [vendors, leads] = await Promise.all([listAllVendors(orgId), listLeads(orgId)])
  const nameByLead = new Map<string, string>(leads.map((l) => [l.id, l.name]))
  const rows: VendorRow[] = vendors.map((v) => ({ ...v, clientName: nameByLead.get(v.lead_id) ?? '' }))
  return <AllVendorsTable orgSlug={orgSlug} rows={rows} />
}
