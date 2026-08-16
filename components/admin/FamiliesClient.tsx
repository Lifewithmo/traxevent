'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Family } from '@/lib/types'
import { FamiliesTable } from '@/components/admin/FamiliesTable'
import { FamilySlideOver } from '@/components/admin/FamilySlideOver'
import { bulkUpdateStatus, buildFamiliesCsvAction } from '@/actions/admin-families'

interface FamiliesClientProps {
  families: Family[]
  orgId: string
  eventId: string
}

export function FamiliesClient({
  families,
  orgId,
  eventId,
}: FamiliesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedFamilyId = searchParams.get('familyId')
  const statusFilter = searchParams.get('status') ?? 'all'

  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Optimistic status updates for instant UI feedback
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Family['registration_status']>>({})
  const [error, setError] = useState<string | null>(null)

  const displayFamilies = families.map(f =>
    statusOverrides[f.id] ? { ...f, registration_status: statusOverrides[f.id] } : f
  )

  function setFamilyId(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('familyId', id)
    } else {
      params.delete('familyId')
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function setStatusFilter(status: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (status === 'all') {
      params.delete('status')
    } else {
      params.set('status', status)
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleStatusChange = useCallback(
    async (familyId: string, status: Family['registration_status']) => {
      setStatusOverrides(prev => ({ ...prev, [familyId]: status }))
    },
    []
  )

  async function handleBulkStatusChange(
    ids: string[],
    status: Family['registration_status']
  ) {
    const overrides: Record<string, Family['registration_status']> = {}
    ids.forEach(id => (overrides[id] = status))
    setError(null)
    setStatusOverrides(prev => ({ ...prev, ...overrides }))
    setSelectedIds(new Set())
    try {
      await bulkUpdateStatus(orgId, eventId, ids, status, 'Admin')
    } catch {
      // Revert optimistic update on failure
      setStatusOverrides(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
      setError('Failed to update status. Please try again.')
    }
  }

  async function handleExport(ids?: string[]) {
    setError(null)
    try {
      const csv = await buildFamiliesCsvAction(orgId, eventId, ids)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'families.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-4 py-2 text-sm border-b bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setError(null)}
            className="text-xs font-semibold hover:opacity-70 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}
      <FamiliesTable
        families={displayFamilies}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedIds={selectedIds}
        onToggleRow={id =>
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }
        onToggleAll={ids => setSelectedIds(new Set(ids))}
        onClearSelection={() => setSelectedIds(new Set())}
        selectedFamilyId={selectedFamilyId}
        onSelectFamily={setFamilyId}
        onBulkStatusChange={handleBulkStatusChange}
        onExport={handleExport}
      />
      <FamilySlideOver
        familyId={selectedFamilyId}
        families={displayFamilies}
        orgId={orgId}
        eventId={eventId}
        onClose={() => setFamilyId(null)}
        onNavigate={setFamilyId}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
