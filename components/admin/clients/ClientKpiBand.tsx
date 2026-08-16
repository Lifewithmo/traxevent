import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { formatRelativeTime } from '@/lib/opportunity-detail'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'

interface ClientKpiBandProps {
  ar: CustomerAR
  rollup: CustomerRollup
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// Money MUST come from CustomerAR (paid/outstanding/overdue) — actual cash —
// never from CustomerRollup.totalWonValue/openValue, which is quoted pipeline
// value and can wildly overstate what's actually owed or collected.
export function ClientKpiBand({ ar, rollup }: ClientKpiBandProps) {
  const totalJobs = rollup.wonCount + rollup.openCount + rollup.lostCount
  const pastDue = ar.overdueAmount > 0

  return (
    <KpiBand>
      <StatTile label="Lifetime paid" value={money(ar.paid)} tone="money" />
      <StatTile
        label="Open balance"
        value={money(ar.outstanding)}
        tone={pastDue ? 'alert' : 'default'}
        note={ar.outstanding === 0 ? 'nothing outstanding' : (ar.overdueAmount > 0 ? '⚠ past due' : 'not yet due')}
      />
      <StatTile label="Jobs" value={`${rollup.wonCount} / ${totalJobs}`} note="won / total" />
      <StatTile
        label="Last activity"
        value={rollup.lastContactAt ? formatRelativeTime(rollup.lastContactAt) : '—'}
      />
    </KpiBand>
  )
}
