'use client'

import type { Family } from '@/lib/types'
import { StatusBadge } from '@/components/admin/StatusBadge'
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
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search families, emails…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <div className="flex gap-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onStatusFilterChange(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-purple-200'
              }`}
            >
              {label} ({counts[key as keyof typeof counts]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onExport()}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-600 hover:border-purple-300 transition-colors"
        >
          Export all
        </button>
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
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="grid grid-cols-[28px_1fr_140px_110px_90px_60px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={handleToggleAll}
            className="accent-purple-600"
          />
          <span>Family</span>
          <span>Campers</span>
          <span>Status</span>
          <span>Balance</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {search
              ? 'No families match your search'
              : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}registrations`}
          </div>
        )}

        {filtered.map(f => {
          const balance = (f.amount_due ?? 0) - (f.amount_paid ?? 0)
          return (
            <div
              key={f.id}
              onClick={() => onSelectFamily(f.id)}
              className={`grid grid-cols-[28px_1fr_140px_110px_90px_60px] gap-2 px-4 py-2.5 border-b border-gray-100 text-sm items-center cursor-pointer transition-colors ${
                selectedFamilyId === f.id ? 'bg-purple-50' : 'hover:bg-purple-50/40'
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
                className="accent-purple-600"
              />
              <div>
                <div className="font-semibold text-gray-900">
                  {f.last_name}, {f.first_name}
                </div>
                <div className="text-xs text-gray-400">{f.email}</div>
              </div>
              <div className="text-gray-500 text-xs truncate">—</div>
              <div>
                <StatusBadge status={f.registration_status} />
              </div>
              <div
                className={`font-semibold text-sm ${
                  balance > 0 ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {balance > 0 ? `$${balance.toFixed(0)}` : '—'}
              </div>
              <div className="text-xs font-semibold text-purple-600">View</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
