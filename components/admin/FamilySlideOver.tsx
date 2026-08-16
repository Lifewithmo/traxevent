'use client'

import { useState, useEffect } from 'react'
import type { Family, FamilyMember } from '@/lib/types'
import { getAdminFamily, updateFamilyStatus } from '@/actions/admin-families'
import { FAMILY_TONE, FAMILY_LABEL } from '@/lib/event-ui'
import { StatusPill } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { FamilyDetailsTab } from '@/components/admin/tabs/FamilyDetailsTab'
import { FamilyCampersTab } from '@/components/admin/tabs/FamilyCampersTab'
import { FamilyPaymentTab } from '@/components/admin/tabs/FamilyPaymentTab'
import { FamilyNotesTab } from '@/components/admin/tabs/FamilyNotesTab'

type Tab = 'details' | 'campers' | 'payment' | 'notes'

interface FamilySlideOverProps {
  familyId: string | null
  families: Family[]
  orgId: string
  eventId: string
  onClose: () => void
  onNavigate: (familyId: string) => void
  onStatusChange: (familyId: string, status: Family['registration_status']) => void
}

export function FamilySlideOver({
  familyId,
  families,
  orgId,
  eventId,
  onClose,
  onNavigate,
  onStatusChange,
}: FamilySlideOverProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [statusError, setStatusError] = useState<string | null>(null)
  // Loading is derived (the loaded family lags the requested id) so the effect
  // never needs a synchronous setState.
  const loading = !!familyId && family?.id !== familyId

  useEffect(() => {
    if (!familyId) return
    ;(async () => {
      const result = await getAdminFamily(orgId, eventId, familyId)
      if (result) {
        setFamily(result.family)
        setMembers(result.members)
      }
    })()
  }, [familyId, orgId, eventId])

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
    setStatusError(null)
    onStatusChange(familyId, status)
    setFamily(prev => prev ? { ...prev, registration_status: status } : prev)
    try {
      await updateFamilyStatus(orgId, eventId, familyId, status, 'Admin')
    } catch {
      // Revert on failure
      onStatusChange(familyId, previousStatus)
      setFamily(prev => prev ? { ...prev, registration_status: previousStatus } : prev)
      setStatusError('Failed to update status. Please try again.')
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={family ? `${family.last_name}, ${family.first_name}` : 'Family details'}
        className="fixed right-0 top-0 bottom-0 z-30 w-full max-w-[440px] bg-card shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-start justify-between">
          {loading || !family ? (
            <div className="h-6 w-40 bg-muted rounded animate-pulse" />
          ) : (
            <div>
              <h2 className="text-base font-bold text-foreground">
                {family.last_name}, {family.first_name}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {family.email} · Registered {new Date(family.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="mt-1.5">
                <StatusPill tone={FAMILY_TONE[family.registration_status]}>{FAMILY_LABEL[family.registration_status]}</StatusPill>
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
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
                <div key={i} className="h-9 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <FamilyDetailsTab
                  key={family.id}
                  family={family}
                  orgId={orgId}
                  eventId={eventId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'campers' && (
                <FamilyCampersTab
                  key={family.id}
                  members={members}
                  familyId={family.id}
                  orgId={orgId}
                  eventId={eventId}
                  onSaved={setMembers}
                />
              )}
              {activeTab === 'payment' && (
                <FamilyPaymentTab
                  key={family.id}
                  family={family}
                  orgId={orgId}
                  eventId={eventId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'notes' && (
                <FamilyNotesTab
                  key={family.id}
                  family={family}
                  orgId={orgId}
                  eventId={eventId}
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
        <div className="px-4 py-3 border-t border-border">
          {statusError && (
            <p className="text-xs text-destructive mb-2" role="alert">
              {statusError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <div className="flex gap-2 flex-1">
              <Button
                size="sm"
                onClick={() => handleStatusChange('confirmed')}
                disabled={family?.registration_status === 'confirmed'}
              >
                Confirm
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('waitlisted')}
              >
                Waitlist
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Prev"
              onClick={() => prevId && onNavigate(prevId)}
              disabled={!prevId}
            >
              ← Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next"
              onClick={() => nextId && onNavigate(nextId)}
              disabled={!nextId}
            >
              Next →
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
