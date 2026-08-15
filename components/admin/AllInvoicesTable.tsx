import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { INVOICE_LIFECYCLE_LABELS } from '@/lib/invoice-status'
import { InvoiceNumberingSettings } from '@/components/admin/InvoiceNumberingSettings'
import type { NormalizedInvoice } from '@/lib/types'

export interface InvoiceRow extends NormalizedInvoice {
  clientName: string
}

interface AllInvoicesTableProps {
  orgSlug: string
  orgId: string
  rows: InvoiceRow[]
  numbering: { prefix?: string; next_number: number }
}

export function AllInvoicesTable({ orgSlug, orgId, rows, numbering }: AllInvoicesTableProps) {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold">Invoices</h1>
          <span className="text-sm text-muted-foreground">{rows.length}</span>
        </div>
        <InvoiceNumberingSettings orgId={orgId} initial={numbering} />
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Number / Title</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No invoices yet.</td></tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/${orgSlug}/leads/${inv.lead_id}/invoices/${inv.id}`} className="block hover:underline">
                      {inv.number ? `#${inv.number}` : (inv.title || 'Invoice')}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{inv.clientName || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{INVOICE_LIFECYCLE_LABELS[inv.lifecycle]}</Badge></td>
                  <td className="px-3 py-2 text-right">${invoiceAmountDue(inv).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">${invoiceBalance(inv).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
