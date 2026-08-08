'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { markLeadLost } from '@/actions/leads'
import { LOST_REASONS } from '@/lib/leads'
import type { LostReason } from '@/lib/types'

interface MarkLostDialogProps {
  orgId: string
  leadId: string
  onDone: () => void
}

export function MarkLostDialog({ orgId, leadId, onDone }: MarkLostDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<LostReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!reason) return
    setBusy(true); setError(null)
    try {
      const trimmed = note.trim()
      await markLeadLost(orgId, leadId, { reason, ...(trimmed ? { note: trimmed } : {}) })
      setOpen(false)
      setReason(null)
      setNote('')
      onDone()
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Mark lost
      </Button>
    )
  }

  return (
    <div className="relative">
      <div
        role="dialog"
        aria-label="Mark lost"
        className="absolute right-0 top-0 z-10 w-72 space-y-2 rounded-lg border bg-background p-3 shadow-md"
      >
        <div className="flex flex-wrap gap-1.5">
          {LOST_REASONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={reason === value}
              onClick={() => setReason(value)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                reason === value
                  ? 'border-destructive bg-destructive/10 font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" disabled={busy || !reason} onClick={confirm}>
            Mark lost
          </Button>
        </div>
      </div>
    </div>
  )
}
