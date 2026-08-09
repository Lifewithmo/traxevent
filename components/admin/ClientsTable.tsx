import Link from 'next/link'
import { buildClientList, lastEventLabel, type ClientGroupBlock, type ClientRow } from '@/lib/crm/client-list'
import { todayYmd } from '@/lib/opportunity-detail'
import type { Customer, Lead } from '@/lib/types'

interface ClientsTableProps {
  orgSlug: string
  customers: Customer[]
  leadsByCustomerId: Record<string, Lead[]>
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

function GroupHeader({ block }: { block: ClientGroupBlock }) {
  const urgent = block.tone === 'urgent'
  return (
    <div
      className={[
        'border-y px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        urgent ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {block.label} · {block.rows.length}
    </div>
  )
}

function Row({ row, orgSlug, urgent }: { row: ClientRow; orgSlug: string; urgent: boolean }) {
  const { customer, rollup } = row
  return (
    <div
      className={[
        'flex items-center gap-4 border-b border-border/60 px-5 py-2.5 text-sm',
        urgent ? 'border-l-2 border-l-destructive' : 'border-l-2 border-l-transparent',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <Link href={`/${orgSlug}/clients/${customer.id}`} className="font-semibold hover:underline">
          {customer.company || customer.name}
        </Link>
        {row.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail}</p>}
      </div>
      <div className={`w-40 shrink-0 text-xs ${urgent ? 'text-destructive' : 'text-muted-foreground'}`}>
        {lastEventLabel(row)}
        {row.nextEventDate && <span className="text-muted-foreground"> · next {row.nextEventDate.slice(5)}</span>}
      </div>
      <div className="w-20 shrink-0 text-right tabular-nums">
        {rollup.openValue > 0 ? money(rollup.openValue) : <span className="text-muted-foreground/60">—</span>}
      </div>
      <div className="w-14 shrink-0 text-right tabular-nums">
        {rollup.wonCount || <span className="text-muted-foreground/60">—</span>}
      </div>
      <div className={`w-24 shrink-0 text-right tabular-nums ${urgent ? 'font-semibold' : ''}`}>
        {rollup.totalWonValue > 0 ? money(rollup.totalWonValue) : <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  )
}

export function ClientsTable({ orgSlug, customers, leadsByCustomerId }: ClientsTableProps) {
  const data = buildClientList({ customers, leadsByCustomerId }, todayYmd())

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Clients</h1>
          <p className="text-xs text-muted-foreground">
            {data.total} · {money(data.lifetimeValue)} lifetime
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-2.5 py-0.5">Worth a call ({data.worthACall})</span>
        <span className="rounded-full border border-foreground px-2.5 py-0.5 font-semibold text-foreground">
          All ({data.total})
        </span>
        <span className="rounded-full border border-border px-2.5 py-0.5">Repeat ({data.repeat})</span>
        <span className="ml-auto">Sorted by longest since last event</span>
      </div>

      <div className="flex gap-4 border-l-2 border-l-transparent px-5 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="min-w-0 flex-1">Client</div>
        <div className="w-40 shrink-0">Last event</div>
        <div className="w-20 shrink-0 text-right">Open</div>
        <div className="w-14 shrink-0 text-right">Won</div>
        <div className="w-24 shrink-0 text-right">Lifetime</div>
      </div>

      {data.blocks.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No clients yet.</p>
      ) : (
        data.blocks.map((block) => (
          <div key={block.group}>
            <GroupHeader block={block} />
            {block.rows.map((row) => (
              <Row key={row.customer.id} row={row} orgSlug={orgSlug} urgent={block.tone === 'urgent'} />
            ))}
          </div>
        ))
      )}
    </div>
  )
}
