'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setLeadWaiting } from '@/actions/leads'

interface MarkWaitingFormProps {
  orgId: string
  leadId: string
}

export function MarkWaitingForm({ orgId, leadId }: MarkWaitingFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await setLeadWaiting(orgId, leadId, {
        reason,
        ...(followUp ? { follow_up_date: followUp } : {}),
      })
      setOpen(false)
      setReason('')
      setFollowUp('')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Mark as waiting
      </Button>
    )
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 w-64 space-y-2 rounded-lg border bg-background p-3 shadow-md">
        <Input
          autoFocus
          placeholder="Waiting on…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Follow-up date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
        />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !reason.trim()} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
