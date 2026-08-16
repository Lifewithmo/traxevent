'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { cn, formatMoney } from '@/lib/utils'
import {
  buildVendorLedger,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONE,
  type VendorLedgerGroup,
  type VendorLedgerRow,
} from '@/lib/vendors'
import { VendorsKpiBand } from '@/components/admin/vendors/VendorsKpiBand'
import { VendorDetailSheet } from '@/components/admin/vendors/VendorDetailSheet'

interface VendorsLedgerProps {
  orgSlug: string
  rows: VendorLedgerRow[]
}

type FacetKey = 'all' | 'potential' | 'confirmed' | 'declined'

const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'potential', label: 'To confirm' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
]

function matchesFacet(row: VendorLedgerRow, facet: FacetKey): boolean {
  return facet === 'all' || row.status === facet
}

function matchesSearch(row: VendorLedgerRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    row.name.toLowerCase().includes(q) ||
    (row.service ?? '').toLowerCase().includes(q) ||
    row.clientName.toLowerCase().includes(q)
  )
}

// Mirrors TodayQueue's GroupHeader; the `potential` group carries the urgent
// tone because it is the operator's to-do, not just another status bucket.
function GroupHeader({ group }: { group: VendorLedgerGroup }) {
  const urgent = group.key === 'potential'
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 border-y px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        urgent
          ? 'border-destructive/25 bg-destructive/5 text-destructive'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span>
        {group.label} · {group.rows.length}
      </span>
      <span className={cn('tabular-nums', urgent ? '' : 'text-[var(--money-green)]')}>
        {formatMoney(group.subtotal)}
      </span>
    </div>
  )
}

function LedgerRow({ row, onOpen }: { row: VendorLedgerRow; onOpen: (row: VendorLedgerRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-label={`${row.name} — ${VENDOR_STATUS_LABELS[row.status]}, ${formatMoney(row.cost ?? 0)}`}
      className="flex w-full items-center gap-3 border-b border-border/60 px-5 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
      {/* R8 — below md the lower-value columns drop out rather than the row scrolling. */}
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">{row.service}</span>
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">{row.clientName}</span>
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--money-green)]">
        {formatMoney(row.cost ?? 0)}
      </span>
      <span className="w-24 shrink-0 text-right">
        <StatusPill tone={VENDOR_STATUS_TONE[row.status]}>{VENDOR_STATUS_LABELS[row.status]}</StatusPill>
      </span>
    </button>
  )
}

export function VendorsLedger({ orgSlug, rows }: VendorsLedgerProps) {
  const [facet, setFacet] = useState<FacetKey>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<VendorLedgerRow | null>(null)

  const visible = useMemo(
    () => rows.filter((r) => matchesFacet(r, facet) && matchesSearch(r, query)),
    [rows, facet, query]
  )
  // Tiles are built from the FILTERED set: the band answers "what does *this*
  // slice cost", not a constant that ignores the operator's current question.
  const ledger = useMemo(() => buildVendorLedger(visible), [visible])

  const filtered = facet !== 'all' || query.trim() !== ''

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Vendors</h1>
          <p className="text-xs text-muted-foreground">
            {filtered
              ? `${visible.length} of ${rows.length} shown`
              : `${rows.length} ${rows.length === 1 ? 'vendor' : 'vendors'}`}
          </p>
        </div>
      </div>

      <div className="px-5 py-3">
        <VendorsKpiBand tiles={ledger.tiles} total={ledger.total} />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {FACETS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFacet(f.key)}
              aria-pressed={facet === f.key}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                facet === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search vendors"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendor, service, client…"
          className="min-w-[12rem] flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="No vendors yet."
          description="Vendors are added from a client's job, then roll up here."
          action={
            <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads`} />}>
              Go to clients
            </Button>
          }
        />
      ) : ledger.groups.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="No vendors match."
          description="Nothing in this org matches the current filter and search."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFacet('all')
                setQuery('')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div>
          {ledger.groups.map((group) => (
            <div key={group.key}>
              <GroupHeader group={group} />
              {group.rows.map((row) => (
                <LedgerRow key={row.id} row={row} onOpen={setSelected} />
              ))}
            </div>
          ))}
        </div>
      )}

      <VendorDetailSheet row={selected} orgSlug={orgSlug} onClose={() => setSelected(null)} />
    </div>
  )
}
