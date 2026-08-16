'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal, ReceiptText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { money0, money2 } from '@/lib/invoice-presentation'
import type { LedgerGroup, LedgerGroupKey, LedgerRow } from '@/lib/invoices-ledger'

type FilterKey = 'all' | 'overdue' | 'open' | 'drafts' | 'settled'

// `open` deliberately CONTAINS `overdue` — an operator asking for open invoices
// means everything still owed; the Overdue chip is the sharper cut of the same set.
const FILTERS: { key: FilterKey; label: string; groups: LedgerGroupKey[] | null }[] = [
  { key: 'all', label: 'All', groups: null },
  { key: 'overdue', label: 'Overdue', groups: ['overdue'] },
  { key: 'open', label: 'Open', groups: ['overdue', 'due_soon', 'awaiting'] },
  { key: 'drafts', label: 'Drafts', groups: ['drafts'] },
  { key: 'settled', label: 'Settled', groups: ['settled'] },
]

// Invoice · Job · Status · Total · Balance · actions. Below md the row stacks
// into a 2-column, 3-row block instead of side-scrolling a <table>.
const GRID = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9.5rem_7rem_7rem_2.25rem]'

function formatDue(dueDate: string): string {
  return new Date(dueDate.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function DueNote({ row }: { row: LedgerRow }) {
  if (!row.dueDate) return <span className="text-xs text-muted-foreground">No due date</span>
  if (row.daysOverdue > 0) {
    return (
      <span className="text-xs text-destructive">
        Due {formatDue(row.dueDate)} · {row.daysOverdue}d late
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">Due {formatDue(row.dueDate)}</span>
}

function GroupHeader({ group }: { group: LedgerGroup }) {
  const urgent = group.key === 'overdue'
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 border-y px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        urgent
          ? 'border-destructive/25 bg-destructive/5 text-destructive'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span>
        {group.label} · {group.rows.length}
      </span>
      {/* A group header that hides its own sum makes the operator add it up. */}
      <span className="tabular-nums">{money0(group.total)}</span>
    </div>
  )
}

function RowActions({ row, orgSlug }: { row: LedgerRow; orgSlug: string }) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.label}`} />}
      >
        <MoreHorizontal />
      </MenuTrigger>
      <MenuContent>
        <MenuItem render={<Link href={`/${orgSlug}/leads/${row.leadId}/invoices/${row.id}`} />}>
          Open invoice
        </MenuItem>
        <MenuItem render={<Link href={`/${orgSlug}/leads/${row.leadId}`} />}>Open job</MenuItem>
      </MenuContent>
    </Menu>
  )
}

function LedgerRowItem({ row, orgSlug }: { row: LedgerRow; orgSlug: string }) {
  return (
    <div
      data-testid="invoice-ledger-row"
      className={cn(
        'grid gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 text-sm last:border-b-0 hover:bg-muted/50',
        'max-md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
        GRID
      )}
    >
      {/* Invoice */}
      <div className="min-w-0 max-md:col-start-1 max-md:row-start-1">
        <Link
          href={`/${orgSlug}/leads/${row.leadId}/invoices/${row.id}`}
          className="block truncate font-medium text-[var(--link)] hover:underline"
        >
          {row.label}
        </Link>
        {row.subtext ? (
          <p className="truncate text-xs text-muted-foreground">{row.subtext}</p>
        ) : null}
      </div>

      {/* Job — the LEAD name, which is what listLeads gives us, not the customer's */}
      <div className="flex min-w-0 items-baseline gap-1 max-md:col-start-1 max-md:row-start-2">
        <span className="text-xs text-muted-foreground md:sr-only">Job</span>
        <span className="truncate text-xs text-muted-foreground md:text-sm md:text-foreground">
          {row.clientName || '—'}
        </span>
      </div>

      {/* Status + the due date the old table never rendered */}
      <div className="flex flex-col gap-0.5 max-md:col-start-2 max-md:row-start-1 max-md:items-end">
        <StatusPill tone={row.pill.tone}>{row.pill.label}</StatusPill>
        <DueNote row={row} />
      </div>

      {/* Total */}
      <div className="flex items-baseline gap-1 max-md:col-start-1 max-md:row-start-3 md:justify-end">
        <span className="text-xs text-muted-foreground md:sr-only">Total</span>
        <span className="text-xs tabular-nums text-muted-foreground md:text-sm">
          {money2(row.total)}
        </span>
      </div>

      {/* Balance — negative when overpaid; that is money in hand, so it reads as money */}
      <div className="flex items-baseline gap-1 max-md:col-start-2 max-md:row-start-2 max-md:justify-end md:justify-end">
        <span className="text-xs text-muted-foreground md:sr-only">Balance</span>
        <span
          className={cn(
            'font-medium tabular-nums',
            row.balance > 0 ? 'text-foreground' : 'text-[var(--money-green)]'
          )}
        >
          {money2(row.balance)}
        </span>
      </div>

      <div className="max-md:col-start-2 max-md:row-start-3 justify-self-end">
        <RowActions row={row} orgSlug={orgSlug} />
      </div>
    </div>
  )
}

function ColumnHeader() {
  return (
    <div
      className={cn(
        'hidden border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground md:grid md:items-center',
        GRID
      )}
    >
      <span>Invoice</span>
      <span>Job</span>
      <span>Status</span>
      <span className="text-right">Total</span>
      <span className="text-right">Balance</span>
      <span />
    </div>
  )
}

interface InvoicesLedgerProps {
  orgSlug: string
  groups: LedgerGroup[]
}

export function InvoicesLedger({ orgSlug, groups }: InvoicesLedgerProps) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const counts = useMemo(() => {
    const byKey = new Map<LedgerGroupKey, number>(groups.map((g) => [g.key, g.rows.length]))
    const out = {} as Record<FilterKey, number>
    for (const f of FILTERS) {
      out[f.key] = f.groups
        ? f.groups.reduce((n, k) => n + (byKey.get(k) ?? 0), 0)
        : groups.reduce((n, g) => n + g.rows.length, 0)
    }
    return out
  }, [groups])

  const visible = useMemo(() => {
    const allowed = FILTERS.find((f) => f.key === filter)?.groups
    return allowed ? groups.filter((g) => allowed.includes(g.key)) : groups
  }, [groups, filter])

  const hasAny = counts.all > 0

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {!hasAny ? (
        <EmptyState
          icon={<ReceiptText className="size-4" />}
          title="No invoices yet"
          description="Invoices are raised from a job — open one and bill it from there."
          action={
            <Button size="sm" variant="outline" render={<Link href={`/${orgSlug}/leads`} />}>
              Go to jobs
            </Button>
          }
          className="py-10"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-4" />}
          title="No invoices match this filter"
          description="Nothing in the ledger is in that state right now."
          action={
            <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
              Show all invoices
            </Button>
          }
          className="py-10"
        />
      ) : (
        <>
          <ColumnHeader />
          {visible.map((group) => (
            <div key={group.key}>
              <GroupHeader group={group} />
              {group.rows.map((row) => (
                <LedgerRowItem key={row.id} row={row} orgSlug={orgSlug} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
