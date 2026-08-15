'use client'

import { useEffect, useState } from 'react'
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
} from '@/components/ui/dialog'

interface SendInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTo: string
  isUpdate: boolean
  onSend: (input: { to: string; message?: string }) => Promise<void>
}

export function SendInvoiceDialog({ open, onOpenChange, defaultTo, isUpdate, onSend }: SendInvoiceDialogProps) {
  const [to, setTo] = useState(defaultTo)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the recipient each time the dialog opens — the customer record may
  // have changed since mount, and a stale address is worse than an empty one.
  useEffect(() => {
    if (open) {
      setTo(defaultTo)
      setError(null)
    }
  }, [open, defaultTo])

  const label = isUpdate ? 'Send update' : 'Send invoice'

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      await onSend({ to: to.trim(), message: message.trim() || undefined })
      setMessage('')
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {isUpdate
              ? 'The customer gets the corrected invoice at the same link and number.'
              : 'Assigns the invoice number and emails the customer a link.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-invoice-to">To</Label>
            <Input
              id="send-invoice-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-invoice-message">Message (optional)</Label>
            <textarea
              id="send-invoice-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a short note for the customer"
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending || to.trim() === ''}>
            {sending ? 'Sending…' : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
