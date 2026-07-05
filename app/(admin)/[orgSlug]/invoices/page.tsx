export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listAllInvoices } from '@/actions/invoices'
import { listLeads } from '@/actions/leads'
import { AllInvoicesTable, type InvoiceRow } from '@/components/admin/AllInvoicesTable'

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [invoices, leads] = await Promise.all([listAllInvoices(orgId), listLeads(orgId)])
  const nameByLead = new Map<string, string>(leads.map((l) => [l.id, l.name]))
  const rows: InvoiceRow[] = invoices.map((inv) => ({ ...inv, clientName: nameByLead.get(inv.lead_id) ?? '' }))
  return <AllInvoicesTable orgSlug={orgSlug} rows={rows} />
}
