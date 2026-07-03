export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getInvoice } from '@/actions/invoices'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'

export default async function InvoiceEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; invoiceId: string }> }) {
  const { orgSlug, leadId, invoiceId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const invoice = await getInvoice(orgId, invoiceId)
  if (!invoice || invoice.lead_id !== leadId) notFound()
  return <InvoiceEditorClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoice={invoice} />
}
