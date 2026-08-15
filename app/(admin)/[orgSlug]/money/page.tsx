export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getMoneyOverview } from '@/actions/money-overview'

const AGING_ROWS: Array<{ key: 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'; label: string }> = [
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days' },
]

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
      style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
    >
      {children}
    </p>
  )
}

export default async function MoneyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { orgId } = await requireOrgMember(orgSlug)
  const o = await getMoneyOverview(orgId)

  const nothingAtAll = o.outstanding === 0 && o.paidThisMonth === 0 && o.overdueCount === 0

  if (nothingAtAll) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Money</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Invoices you issue show up here — what&apos;s outstanding, what&apos;s late, and what came in this month.
        </p>
        <Link href={`/${orgSlug}/invoices`} className="mt-4 inline-block text-sm font-medium text-primary underline">
          Go to invoices
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="sr-only">Money</h1>

      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(260px,380px)] gap-8 max-[1100px]:grid-cols-1"
        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}
      >
        <div>
          <KpiLabel>Overdue</KpiLabel>
          <p
            className={`text-[40px] font-semibold leading-none tabular-nums tracking-[-.02em]${
              o.overdueCount > 0 ? ' text-destructive' : ''
            }`}
          >
            {money(o.overdue)}
          </p>
          <p className={`mt-1 text-sm ${o.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {o.overdueCount > 0
              ? `${o.overdueCount} invoice${o.overdueCount === 1 ? '' : 's'} past due`
              : 'nothing overdue — all invoices are current'}
          </p>

          {o.overdueInvoices.length > 0 && (
            <ul className="mt-4">
              {o.overdueInvoices.map((i) => (
                <li key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Link
                    href={`/${orgSlug}/leads/${i.leadId}/invoices/${i.id}`}
                    className="flex items-baseline justify-between gap-4 py-2 hover:bg-muted/40"
                  >
                    <span className="truncate text-sm font-medium">{i.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {i.daysOverdue} day{i.daysOverdue === 1 ? '' : 's'} late
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{money(i.balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4 max-[1100px]:flex-row max-[1100px]:gap-8">
          <div>
            <KpiLabel>Outstanding</KpiLabel>
            <p className="text-[22px] font-semibold leading-tight tabular-nums">{money(o.outstanding)}</p>
            <p className="text-xs text-muted-foreground">everything issued and unpaid</p>
          </div>
          <div>
            <KpiLabel>Paid this month</KpiLabel>
            <p className="text-[22px] font-semibold leading-tight tabular-nums">{money(o.paidThisMonth)}</p>
            <p className="text-xs text-muted-foreground">payments recorded so far</p>
          </div>
        </div>
      </div>

      {o.outstanding > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4">
          {AGING_ROWS.map((r) => (
            <div key={r.key}>
              <KpiLabel>{r.label}</KpiLabel>
              <p className="text-sm tabular-nums">{money(o.aging[r.key])}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4 pt-6 text-sm">
        <Link href={`/${orgSlug}/invoices`} className="underline">All invoices</Link>
        <Link href={`/${orgSlug}/reports`} className="underline">Reports</Link>
      </div>
    </div>
  )
}
