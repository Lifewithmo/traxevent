'use client'

import type { Family } from '@/lib/types'
import { FAMILY_TONE, FAMILY_LABEL } from '@/lib/event-ui'
import { StatusPill } from '@/components/ui/status-pill'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { BulkToolbar } from '@/components/admin/BulkToolbar'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'waitlisted', label: 'Waitlist' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Mirrors CheckinClient's money-pill formatter — ONE mobile money language for
// Casey. Whole-dollar balances drop cents; fractional balances keep them.
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

interface FamiliesTableProps {
  families: Family[]
  search: string
  onSearchChange: (s: string) => void
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  selectedIds: Set<string>
  onToggleRow: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onClearSelection: () => void
  selectedFamilyId: string | null
  onSelectFamily: (id: string) => void
  onBulkStatusChange: (ids: string[], status: Family['registration_status']) => void
  onExport: (ids?: string[]) => void
}

export function FamiliesTable({
  families,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onClearSelection,
  selectedFamilyId,
  onSelectFamily,
  onBulkStatusChange,
  onExport,
}: FamiliesTableProps) {
  // Client-side filter
  const filtered = families.filter(f => {
    if (statusFilter !== 'all' && f.registration_status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${f.last_name} ${f.first_name}`.toLowerCase()
      if (!name.includes(q) && !f.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Status counts for filter pills
  const counts = {
    all: families.length,
    pending: families.filter(f => f.registration_status === 'pending').length,
    confirmed: families.filter(f => f.registration_status === 'confirmed').length,
    waitlisted: families.filter(f => f.registration_status === 'waitlisted').length,
    cancelled: families.filter(f => f.registration_status === 'cancelled').length,
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(f => selectedIds.has(f.id))

  function handleToggleAll() {
    if (allFilteredSelected) {
      onClearSelection()
    } else {
      onToggleAll(filtered.map(f => f.id))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/50 border-b border-border">
        <Input
          type="text"
          placeholder="Search families, emails…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 min-w-40 bg-background"
        />
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              onClick={() => onStatusFilterChange(key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {label} ({counts[key as keyof typeof counts]})
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => onExport()}>
          Export all
        </Button>
      </div>

      {/* Bulk toolbar */}
      <BulkToolbar
        selectedCount={selectedIds.size}
        onStatusChange={status =>
          onBulkStatusChange(Array.from(selectedIds), status)
        }
        onExport={() => onExport(Array.from(selectedIds))}
        onClear={onClearSelection}
      />

      {/*
        List — SINGLE DOM tree, two responsive skins (jsdom/text tests match once):
        - Base (<sm, phones): card rows mirroring CheckinClient's shipped
          line-pressure idiom — name (primary) + StatusPill + balance money-pill
          ONLY when balance > 0 (no dash noise), plus a visible ≥24px checkbox so
          bulk survives on the phone. No min-width → no horizontal pan.
        - ≥sm: the original 5-column grid, unchanged.
        Phone budget: find (search) → tap (card → slide-over) → decide → next
        (slide-over Prev/Next, shipped) ≤ 5 touches, no pan.
      */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <div className="sm:min-w-[560px]">
          {/*
            Header — ≥sm: the column-label grid (unchanged). Below sm the dead
            label row becomes a base-width "Select all (n)" line, so
            registration-season bulk-confirm at 375px stays a 2-tap flow
            (Select all → Confirm). ONE select-all checkbox serves both modes.
          */}
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:grid sm:grid-cols-[28px_1fr_110px_90px_60px] sm:gap-2">
            <input
              id="families-select-all"
              type="checkbox"
              checked={allFilteredSelected}
              onChange={handleToggleAll}
              aria-label={`Select all (${filtered.length})`}
              className="accent-primary size-6 sm:size-auto" /* ≥24px target below sm */
            />
            <label
              htmlFor="families-select-all"
              className="sm:hidden cursor-pointer select-none"
            >
              Select all ({filtered.length})
            </label>
            <span className="hidden sm:block">Family</span>
            <span className="hidden sm:block">Status</span>
            <span className="hidden sm:block">Balance</span>
            <span className="hidden sm:block" />
          </div>

          {filtered.length === 0 && (
            <EmptyState
              className="py-12"
              title={
                search
                  ? 'No families match your search'
                  : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}registrations`
              }
            />
          )}

          {filtered.map(f => {
            const balance = (f.amount_due ?? 0) - (f.amount_paid ?? 0)
            return (
              /*
                Row — base (<sm): 2-col card grid (checkbox | name+email over a
                wrapped pills line). ≥sm: the original 5-col row. Row tap opens
                the slide-over; the checkbox is a separate ≥24px target that only
                toggles selection (stopPropagation below).
              */
              <div
                key={f.id}
                onClick={() => onSelectFamily(f.id)}
                className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-cols-[28px_1fr_110px_90px_60px] sm:gap-2 sm:py-2.5 sm:items-center border-b border-border/60 text-sm cursor-pointer transition-colors ${
                  selectedFamilyId === f.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={e => {
                    e.stopPropagation()
                    onToggleRow(f.id)
                  }}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Select ${f.last_name}, ${f.first_name}`}
                  className="accent-primary size-6 self-center row-span-2 sm:size-auto sm:row-span-1" /* ≥24px target below sm; spans name+pills rows */
                />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">
                    {f.last_name}, {f.first_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{f.email}</div>
                </div>
                {/*
                  Below sm this wrapper is the card's wrapped pills line
                  (CheckinClient's line-pressure idiom); at ≥sm `contents`
                  dissolves it so Status/Balance stay their own grid columns —
                  desktop grid unchanged, one DOM tree.
                */}
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:contents">
                  <div>
                    <StatusPill tone={FAMILY_TONE[f.registration_status]}>{FAMILY_LABEL[f.registration_status]}</StatusPill>
                  </div>
                  {/*
                    Balance — check-in's money-pill idiom: a chip ONLY when
                    balance > 0. No dash noise (the old '—' is gone in both
                    modes). Zero-balance cell hides below sm (no phantom flex
                    gap) but keeps its ≥sm grid slot so View stays in column 5.
                  */}
                  <div className={balance > 0 ? undefined : 'hidden sm:block'}>
                    {balance > 0 && (
                      <StatusPill tone="alert">${fmtMoney(balance)} due</StatusPill>
                    )}
                  </div>
                </div>
                <div className="hidden sm:block text-xs font-semibold text-primary">View</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
