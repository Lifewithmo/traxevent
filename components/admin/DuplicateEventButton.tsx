'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { duplicateEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DuplicateEventProps {
  orgId: string
  orgSlug: string
  sourceEventId: string
  sourceName: string
}

/**
 * Row-actions menu for the org events ledger. Self-contained: renders the kit
 * Menu trigger plus the DuplicateEventDialog it drives. It sits inside the
 * row's <Link>, so the wrapper swallows clicks: stopPropagation keeps the
 * Link's client navigation from firing (menu/dialog portals still bubble
 * through the React tree), and preventDefault — only for clicks physically
 * inside the wrapper, i.e. the trigger — cancels the anchor's native
 * navigation without breaking label/input defaults inside the portaled dialog.
 */
export function DuplicateEventMenu(props: DuplicateEventProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <span
      className="shrink-0"
      onClick={(e) => {
        e.stopPropagation()
        if (e.currentTarget.contains(e.target as Node)) e.preventDefault()
      }}
    >
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onClick={() => setDialogOpen(true)}>Duplicate</MenuItem>
        </MenuContent>
      </Menu>
      <DuplicateEventDialog {...props} open={dialogOpen} onOpenChange={setDialogOpen} />
    </span>
  )
}

export function DuplicateEventDialog({
  orgId,
  orgSlug,
  sourceEventId,
  sourceName,
  open,
  onOpenChange,
}: DuplicateEventProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [name, setName] = useState(sourceName)
  const [year, setYear] = useState(new Date().getFullYear() + 1)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDuplicate() {
    if (!name.trim() || !start || !end) return
    setBusy(true)
    setError(null)
    try {
      const event = await duplicateEvent(orgId, sourceEventId, { name: name.trim(), year, event_start: start, event_end: end })
      router.push(`/${orgSlug}/${event.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate')
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate event</DialogTitle>
          <DialogDescription>
            Copies settings, assignment slots, and forms. Registrants are not copied.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`dup-name-${sourceEventId}`}>New event name</Label>
            <Input id={`dup-name-${sourceEventId}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`dup-year-${sourceEventId}`}>Year</Label>
              <Input
                id={`dup-year-${sourceEventId}`}
                type="number"
                min={2020}
                max={2040}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`dup-start-${sourceEventId}`}>Start</Label>
              <Input id={`dup-start-${sourceEventId}`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`dup-end-${sourceEventId}`}>End</Label>
              <Input id={`dup-end-${sourceEventId}`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={busy || !name.trim() || !start || !end || year < 2020}>
            {busy ? 'Duplicating…' : 'Create duplicate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
