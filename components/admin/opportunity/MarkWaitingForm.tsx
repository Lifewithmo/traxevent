'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { setLeadWaiting } from '@/actions/leads'

interface MarkWaitingFormProps {
  orgId: string
  leadId: string
  /**
   * Controlled open state — same contract as MarkLostDialog. Omitted, the
   * component owns its state and renders the "Mark as waiting" button the
   * next-action banner needs; supplied, the header actions menu drives it.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MarkWaitingForm({ orgId, leadId, open: openProp, onOpenChange }: MarkWaitingFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const controlled = openProp !== undefined
  const open = controlled ? openProp : internalOpen

  function setOpen(next: boolean) {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Mark as waiting</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as waiting</DialogTitle>
          <DialogDescription>
            Parking the deal stops it reading as neglected. Set a follow-up date and it comes back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="mw-reason">Waiting on</Label>
          <Input
            id="mw-reason"
            placeholder="Waiting on…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mw-followup">Follow-up date</Label>
          <Input
            id="mw-followup"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !reason.trim()} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
