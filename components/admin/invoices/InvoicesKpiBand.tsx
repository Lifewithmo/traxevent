import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { buildMoneyOverview } from '@/lib/money-overview'
import { money0 } from '@/lib/invoice-presentation'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import type { NormalizedInvoice } from '@/lib/types'

interface InvoicesKpiBandProps {
  invoices: NormalizedInvoice[]
  now?: Date
}

/**
 * The four AR figures the org's invoice ledger is answering. The money comes
 * straight from `buildMoneyOverview` — the same rollup the /money overview
 * uses — so the two surfaces can never disagree.
 *
 * Server component on purpose: only the ledger below it needs filter state.
 */
export function InvoicesKpiBand({ invoices, now = new Date() }: InvoicesKpiBandProps) {
  const o = buildMoneyOverview(invoices, now)

  // Counts, not money — the rollup deliberately exposes dollars only.
  let openCount = 0
  let draftCount = 0
  let draftTotal = 0
  for (const inv of invoices) {
    if (inv.lifecycle === 'draft') {
      draftCount += 1
      draftTotal += invoiceAmountDue(inv)
      continue
    }
    if (inv.lifecycle !== 'sent') continue
    if (invoiceAmountDue(inv) - amountPaid(inv.payments ?? []) > 0) openCount += 1
  }

  // `paidThisMonth` sums payments whose `recorded_at` falls in the current
  // CALENDAR month (UTC), so the tile says "this month" — never "30d".
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })

  return (
    <KpiBand>
      <StatTile
        label="Outstanding"
        value={money0(o.outstanding)}
        tone="money"
        note={openCount === 1 ? '1 open invoice' : `${openCount} open invoices`}
      />
      <StatTile
        label="Overdue"
        value={money0(o.overdue)}
        tone={o.overdueCount > 0 ? 'alert' : 'default'}
        note={
          o.overdueCount === 0
            ? 'nothing past due'
            : `${o.overdueCount} ${o.overdueCount === 1 ? 'invoice' : 'invoices'} past due`
        }
      />
      <StatTile
        label="Drafts"
        value={String(draftCount)}
        note={`${money0(draftTotal)} not yet sent`}
      />
      <StatTile
        label="Collected this month"
        value={money0(o.paidThisMonth)}
        tone="money"
        note={`${monthLabel} to date`}
      />
    </KpiBand>
  )
}
