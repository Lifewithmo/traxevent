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

      {/* Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Header */}
          <div className="grid grid-cols-[28px_1fr_110px_90px_60px] gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={handleToggleAll}
              className="accent-primary"
            />
            <span>Family</span>
            <span>Status</span>
            <span>Balance</span>
            <span />
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
              <div
                key={f.id}
                onClick={() => onSelectFamily(f.id)}
                className={`grid grid-cols-[28px_1fr_110px_90px_60px] gap-2 px-4 py-2.5 border-b border-border/60 text-sm items-center cursor-pointer transition-colors ${
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
                  className="accent-primary"
                />
                <div>
                  <div className="font-semibold text-foreground">
                    {f.last_name}, {f.first_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.email}</div>
                </div>
                <div>
                  <StatusPill tone={FAMILY_TONE[f.registration_status]}>{FAMILY_LABEL[f.registration_status]}</StatusPill>
                </div>
                <div
                  className={`font-semibold text-sm ${
                    balance > 0 ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  {balance > 0 ? `$${balance.toFixed(0)}` : '—'}
                </div>
                <div className="text-xs font-semibold text-primary">View</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
