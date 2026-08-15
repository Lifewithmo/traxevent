import type { PublicInvoice } from '@/actions/invoices-public'
import { lineItemSubtotal } from '@/lib/invoices'

// Plain presentational component — read-only, no handlers, so no 'use client'.
// Document-shaped page (no stacked cards): a single sheet mirroring the
// printed/PDF invoice, shared visual language with the Task 6 editor.
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
    <main className="min-h-screen bg-muted/30 py-10 print:bg-white print:py-0">
      <div className="invoice-document mx-auto max-w-3xl rounded-lg bg-white px-10 py-12 shadow-sm print:rounded-none print:shadow-none">
        {/* Header: logo + from (left) — number/status/dates (right) */}
        <header className="flex items-start justify-between gap-6 border-b pb-8">
          <div>
            {invoice.from?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={invoice.from.logo_url} alt="" className="mb-3 h-12 object-contain" />
            )}
            {invoice.from && (
              <>
                <p className="text-sm font-semibold">{invoice.from.name}</p>
                {invoice.from.address && (
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{invoice.from.address}</p>
                )}
              </>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
            {invoice.title && <p className="mt-1 text-sm text-muted-foreground">{invoice.title}</p>}
            {isPaid ? (
              <span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-800">
                Paid
              </span>
            ) : (
              invoice.due_date && <p className="mt-1 text-sm text-muted-foreground">Due {invoice.due_date}</p>
            )}
            {invoice.sent_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">Sent {new Date(invoice.sent_at).toLocaleDateString()}</p>
            )}
          </div>
        </header>

        {/* Bill to */}
        {invoice.bill_to && (
          <div className="border-b py-6">
            <p className="font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Bill to</p>
            <p className="mt-1.5 text-sm font-semibold">{invoice.bill_to.name}</p>
            {invoice.bill_to.company && <p className="mt-0.5 text-sm text-muted-foreground">{invoice.bill_to.company}</p>}
            {invoice.bill_to.email && <p className="mt-0.5 text-sm text-muted-foreground">{invoice.bill_to.email}</p>}
          </div>
        )}

        {/* Line items */}
        <table className="mt-6 w-full text-sm" data-testid="invoice-line-items">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 px-4 text-right font-medium">Qty</th>
              <th className="py-2 px-4 text-right font-medium">Unit price</th>
              <th className="py-2 pl-4 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{item.description}</td>
                <td className="py-2 px-4 text-right">{item.quantity}</td>
                <td className="py-2 px-4 text-right">{money(item.unit_price)}</td>
                <td className="py-2 pl-4 text-right">{money(lineItemSubtotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals: right-aligned block */}
        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium">{money(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {invoice.discount?.reason ? `Discount — ${invoice.discount.reason}` : 'Discount'}
                </dt>
                <dd className="font-medium">−{money(invoice.discount_amount)}</dd>
              </div>
            )}
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="font-medium">+{money(invoice.tax_amount)}</dd>
              </div>
            )}
            {invoice.credits.map((credit, i) => (
              <div key={i} className="flex justify-between">
                <dt className="text-muted-foreground">{credit.description || 'Credit'}</dt>
                <dd className="font-medium">−{money(credit.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-semibold">{money(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd className="font-medium">{money(invoice.amount_paid)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="font-semibold">Balance due</dt>
              <dd className="font-semibold">{money(invoice.balance)}</dd>
            </div>
          </dl>
        </div>

        {isPaid ? (
          <p className="mt-4 text-right text-sm font-medium text-emerald-700">Paid in full — thank you.</p>
        ) : (
          <p className="mt-4 text-right text-lg font-semibold">Balance due: {money(invoice.balance)}</p>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-8 border-t pt-6">
            <p className="font-mono text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Notes</p>
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
          </div>
        )}
      </div>
    </main>
  )
}
