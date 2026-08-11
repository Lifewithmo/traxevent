import type { PublicInvoice } from '@/actions/invoices-public'
import { lineItemSubtotal } from '@/lib/invoices'
import { INVOICE_TYPE_LABELS } from '@/lib/invoice-status'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Plain presentational component — read-only, no handlers, so no 'use client'.
// NOTE: online invoice payment (Stripe Connect pay button) is a deferred
// follow-up. Once Stripe keys are live, add a "Pay now" button here that
// charges the outstanding balance; today payments are recorded manually by the
// org and this page is read-only.

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function InvoiceViewClient({ invoice }: { invoice: PublicInvoice }) {
  const total = invoice.total
  const heading = invoice.number ? `Invoice #${invoice.number}` : 'Invoice'
  const isPaid = invoice.balance <= 0

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
            {invoice.title && <p className="mt-1 text-gray-600">{invoice.title}</p>}
          </div>
          <Badge>{INVOICE_TYPE_LABELS[invoice.type]}</Badge>
        </div>

        {(invoice.from || invoice.bill_to) && (
          <div className="mb-6 grid gap-6 sm:grid-cols-2">
            {invoice.from && (
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  From
                </p>
                <p className="mt-1.5 text-sm font-semibold text-gray-900">{invoice.from.name}</p>
                {invoice.from.address && (
                  <p className="mt-0.5 text-sm whitespace-pre-line text-gray-600">{invoice.from.address}</p>
                )}
              </div>
            )}
            {invoice.bill_to && (
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Bill to
                </p>
                <p className="mt-1.5 text-sm font-semibold text-gray-900">{invoice.bill_to.name}</p>
                {invoice.bill_to.company && (
                  <p className="mt-0.5 text-sm text-gray-600">{invoice.bill_to.company}</p>
                )}
                {invoice.bill_to.email && (
                  <p className="mt-0.5 text-sm text-gray-600">{invoice.bill_to.email}</p>
                )}
              </div>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 px-4 text-right font-medium">Qty</th>
                  <th className="py-2 px-4 text-right font-medium">Unit price</th>
                  <th className="py-2 pl-4 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 text-gray-900">{item.description}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{item.quantity}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{money(item.unit_price)}</td>
                    <td className="py-2 pl-4 text-right text-gray-900">
                      {money(lineItemSubtotal(item))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-3 pr-4 text-right font-semibold text-gray-900">
                    Total
                  </td>
                  <td className="py-3 pl-4 text-right font-semibold text-gray-900">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal</dt>
                <dd className="font-medium text-gray-900">{money(invoice.subtotal)}</dd>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Discount</dt>
                  <dd className="font-medium text-gray-900">−{money(invoice.discount_amount)}</dd>
                </div>
              )}
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Tax</dt>
                  <dd className="font-medium text-gray-900">+{money(invoice.tax_amount)}</dd>
                </div>
              )}
              {invoice.credits.map((credit, i) => (
                <div key={i} className="flex justify-between">
                  <dt className="text-gray-600">{credit.description || 'Credit'}</dt>
                  <dd className="font-medium text-gray-900">−{money(credit.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2">
                <dt className="font-semibold text-gray-900">Total</dt>
                <dd className="font-semibold text-gray-900">{money(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Amount paid</dt>
                <dd className="font-medium text-gray-900">{money(invoice.amount_paid)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt className="font-semibold text-gray-900">Balance due</dt>
                <dd className="font-semibold text-gray-900">{money(invoice.balance)}</dd>
              </div>
            </dl>

            {isPaid ? (
              <p className="mt-4 text-sm font-medium text-green-700">Paid in full — thank you.</p>
            ) : (
              <p className="mt-4 text-lg font-semibold text-gray-900">
                Balance due: {money(invoice.balance)}
              </p>
            )}
          </CardContent>
        </Card>

        {invoice.due_date && (
          <p className="mt-4 text-sm text-gray-600">Due {invoice.due_date}</p>
        )}

        {invoice.notes && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
