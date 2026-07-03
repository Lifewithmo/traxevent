export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicInvoice } from '@/actions/invoices-public'
import { InvoiceViewClient } from '@/components/invoices/InvoiceViewClient'

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getPublicInvoice(token)
  if (!invoice) notFound()
  return <InvoiceViewClient invoice={invoice} />
}
