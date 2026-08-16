'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { markLeadLost } from '@/actions/leads'
import { LOST_REASONS } from '@/lib/leads'
import { cn } from '@/lib/utils'
import type { LostReason } from '@/lib/types'

interface MarkLostDialogProps {
  orgId: string
  leadId: string
  onDone: () => void
  /**
   * Controlled open state. Omit and the dialog owns it and renders its own
   * "Mark lost" trigger; supply it (as the header actions menu does) and the
   * trigger is dropped, because a menu item already opened it.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MarkLostDialog({ orgId, leadId, onDone, open: openProp, onOpenChange }: MarkLostDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [reason, setReason] = useState<LostReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const controlled = openProp !== undefined
  const open = controlled ? openProp : internalOpen

  function setOpen(next: boolean) {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  // Not named `confirm` — that shadows window.confirm, which this whole
  // increment is about getting off the page.
  async function confirmLost() {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Mark lost</DialogTrigger>
      )}
      {/* Wider than the kit's 384px default: four reason chips plus a note line
          wrap into an unreadable column at sm:max-w-sm. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark lost</DialogTitle>
          <DialogDescription>
            Pick why it went away — lost reasons are what make the pipeline readable a quarter from now.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {LOST_REASONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={reason === value}
              onClick={() => setReason(value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                reason === value
                  ? 'border-destructive bg-destructive/10 font-medium text-destructive'
                  : 'border-border hover:bg-muted'
              )}
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

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy || !reason} onClick={confirmLost}>
            Mark lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
