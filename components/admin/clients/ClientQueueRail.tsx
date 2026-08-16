'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import { lastEventLabel, type ClientGroup, type ClientRow } from '@/lib/crm/client-list'

interface ClientQueueRailProps {
  orgSlug: string
  rows: ClientRow[]
}

type FilterKey = 'all' | 'active' | 'leads' | 'past_due' | 'dormant'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'leads', label: 'Leads' },
  { key: 'past_due', label: 'Past-due' },
  { key: 'dormant', label: 'Dormant' },
]

// Mirrors GROUP_ORDER/GROUP_META in lib/crm/client-list.ts, which aren't
// exported (buildClientList only hands back pre-grouped blocks, and this
// rail groups a flat ClientRow[] on its own). Keep labels in sync by hand.
const GROUP_ORDER: ClientGroup[] = ['dormant_repeat', 'booked_now', 'never_booked']
const GROUP_LABEL: Record<ClientGroup, string> = {
  dormant_repeat: 'Repeat clients with nothing booked',
  booked_now: 'Booked with you now',
  never_booked: 'Never booked',
}

// AR/invoice balances aren't part of ClientRow yet (see lib/crm/client-list.ts —
// no owed/pastDue field exists; that lands with the AR panel, plan letter D).
// The chip stays wired up but honestly matches nothing until a real balance
// is available on the row, rather than guessing from pipeline value.
function isPastDue(_row: ClientRow): boolean {
  return false
}

function matchesFilter(row: ClientRow, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'dormant':
      return row.group === 'dormant_repeat'
    case 'past_due':
      return isPastDue(row)
    case 'active':
      return row.group !== 'dormant_repeat' && row.rollup.wonCount > 0
    case 'leads':
      return row.group !== 'dormant_repeat' && row.rollup.wonCount === 0
  }
}

function matchesSearch(row: ClientRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    row.customer.name.toLowerCase().includes(q) ||
    (row.customer.company ?? '').toLowerCase().includes(q)
  )
}

function QueueRow({ row, orgSlug, isActive }: { row: ClientRow; orgSlug: string; isActive: boolean }) {
  const dormant = row.group === 'dormant_repeat'
  const signal =
    row.group === 'never_booked' && !row.lastEventDate ? 'New' : lastEventLabel(row)

  return (
    <Link
      href={`/${orgSlug}/clients/${row.customer.id}`}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
        isActive ? 'bg-card' : 'hover:bg-card/60'
      )}
    >
      <Avatar name={row.customer.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{row.customer.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.detail || row.customer.company || '—'}
        </span>
      </span>
      <span className="shrink-0">
        {dormant ? (
          <StatusPill tone="alert">{signal}</StatusPill>
        ) : (
          <span className="text-xs text-muted-foreground">{signal}</span>
        )}
      </span>
    </Link>
  )
}

export function ClientQueueRail({ orgSlug, rows }: ClientQueueRailProps) {
  const pathname = usePathname()
  const selectedId = (pathname ?? '').split('/').filter(Boolean).pop()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const visible = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter) && matchesSearch(r, query)),
    [rows, filter, query]
  )

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        label: GROUP_LABEL[group],
        rows: visible.filter((r) => r.group === group),
      })).filter((b) => b.rows.length > 0),
    [visible]
  )

  return (
    <div className="flex h-full w-[304px] shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-sidebar-foreground">Clients</h2>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </div>
        <button type="button" className="text-xs font-medium text-primary hover:underline">
          + Add
        </button>
      </div>

      <div className="px-3 pt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 py-2">
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
                : 'bg-card text-muted-foreground hover:text-sidebar-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No clients match.</p>
        ) : (
          groups.map((block) => (
            <div key={block.group} className="mb-2">
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {block.label}
              </div>
              {block.rows.map((row) => (
                <QueueRow
                  key={row.customer.id}
                  row={row}
                  orgSlug={orgSlug}
                  isActive={row.customer.id === selectedId}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
