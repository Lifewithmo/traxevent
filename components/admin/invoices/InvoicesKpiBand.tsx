import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { buildMoneyOverview, round2 } from '@/lib/money-overview'
import { money0 } from '@/lib/invoice-presentation'
import { invoiceAmountDue } from '@/lib/invoices'
import type { NormalizedInvoice } from '@/lib/types'

interface InvoicesKpiBandProps {
  invoices: NormalizedInvoice[]
  /**
   * Required, not defaulted: the page renders this band next to a ledger built
   * from its own clock, and a second `new Date()` here could land on the other
   * side of UTC midnight — tipping one invoice from "due soon" to "overdue" in
   * the tiles while the ledger below still groups it the old way.
   */
  now: Date
}

/**
 * The four AR figures the org's invoice ledger is answering. The money comes
 * straight from `buildMoneyOverview` — the same rollup the /money overview
 * uses — so the two surfaces can never disagree.
 *
 * Server component on purpose: only the ledger below it needs filter state.
 */
export function InvoicesKpiBand({ invoices, now }: InvoicesKpiBandProps) {
  const o = buildMoneyOverview(invoices, now)

  // Drafts are the one figure the AR rollup has no opinion on — it excludes
  // them by design. `openCount` comes from the rollup itself (o.openCount) so
  // the note under Outstanding can never count a different set of invoices
  // than the dollar figure above it.
  let draftCount = 0
  let draftTotal = 0
  for (const inv of invoices) {
    if (inv.lifecycle !== 'draft') continue
    draftCount += 1
    draftTotal += invoiceAmountDue(inv)
  }
  // Accumulated sums carry float dust (10.10 + 20.20 === 30.299999999999997).
  // `money0` happens to hide it at whole-dollar precision, but the codebase
  // rounds where it sums, not where it formats — the tile should not depend on
  // the formatter to stay honest.
  draftTotal = round2(draftTotal)

  // `paidThisMonth` sums payments whose `recorded_at` falls in the current
  // CALENDAR month (UTC), so the tile says "this month" — never "30d".
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })

  return (
    <KpiBand>
      <StatTile
        label="Outstanding"
        value={money0(o.outstanding)}
        tone="money"
        note={o.openCount === 1 ? '1 open invoice' : `${o.openCount} open invoices`}
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
