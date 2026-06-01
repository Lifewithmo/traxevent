'use client'

import { useState, useEffect } from 'react'
import type { Family, FamilyMember } from '@/lib/types'
import { getAdminFamily, updateFamilyStatus } from '@/actions/admin-families'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { FamilyDetailsTab } from '@/components/admin/tabs/FamilyDetailsTab'
import { FamilyCampersTab } from '@/components/admin/tabs/FamilyCampersTab'
import { FamilyPaymentTab } from '@/components/admin/tabs/FamilyPaymentTab'
import { FamilyNotesTab } from '@/components/admin/tabs/FamilyNotesTab'

type Tab = 'details' | 'campers' | 'payment' | 'notes'

interface FamilySlideOverProps {
  familyId: string | null
  families: Family[]
  orgId: string
  campId: string
  onClose: () => void
  onNavigate: (familyId: string) => void
  onStatusChange: (familyId: string, status: Family['registration_status']) => void
}

export function FamilySlideOver({
  familyId,
  families,
  orgId,
  campId,
  onClose,
  onNavigate,
  onStatusChange,
}: FamilySlideOverProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!familyId) return
    setLoading(true)
    ;(async () => {
      try {
        const result = await getAdminFamily(orgId, campId, familyId)
        if (result) {
          setFamily(result.family)
          setMembers(result.members)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [familyId, orgId, campId])

  // Keyboard: Escape closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!familyId) return null

  const currentIndex = families.findIndex(f => f.id === familyId)
  const prevId = currentIndex > 0 ? families[currentIndex - 1].id : null
  const nextId = currentIndex < families.length - 1 ? families[currentIndex + 1].id : null

  async function handleStatusChange(status: Family['registration_status']) {
    if (!familyId || !family) return
    const previousStatus = family.registration_status
    onStatusChange(familyId, status)
    setFamily(prev => prev ? { ...prev, registration_status: status } : prev)
    try {
      await updateFamilyStatus(orgId, campId, familyId, status, 'Admin')
    } catch {
      // Revert on failure
      onStatusChange(familyId, previousStatus)
      setFamily(prev => prev ? { ...prev, registration_status: previousStatus } : prev)
      alert('Failed to update status. Please try again.')
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'campers', label: `Campers (${members.length})` },
    { key: 'payment', label: 'Payment' },
    { key: 'notes', label: `Notes (${family?.notes?.length ?? 0})` },
  ]

  return (
    <>
      {/* Backdrop (click to close) */}
      <div
        className="fixed inset-0 z-20 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-30 w-[440px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between">
          {loading || !family ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {family.last_name}, {family.first_name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {family.email} · Registered {new Date(family.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={family.registration_status} />
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'text-purple-700 border-purple-600'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading || !family ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <FamilyDetailsTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'campers' && (
                <FamilyCampersTab
                  members={members}
                  familyId={family.id}
                  orgId={orgId}
                  campId={campId}
                  onSaved={setMembers}
                />
              )}
              {activeTab === 'payment' && (
                <FamilyPaymentTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'notes' && (
                <FamilyNotesTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onNoteAdded={note =>
                    setFamily(prev =>
                      prev ? { ...prev, notes: [...(prev.notes ?? []), note] } : prev
                    )
                  }
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
          <div className="flex gap-2 flex-1">
            <button
              type="button"
              onClick={() => handleStatusChange('confirmed')}
              disabled={family?.registration_status === 'confirmed'}
              className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('waitlisted')}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-md hover:border-purple-300 transition-colors"
            >
              Waitlist
            </button>
          </div>
          <button
            type="button"
            aria-label="Prev"
            onClick={() => prevId && onNavigate(prevId)}
            disabled={!prevId}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => nextId && onNavigate(nextId)}
            disabled={!nextId}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </>
  )
}
