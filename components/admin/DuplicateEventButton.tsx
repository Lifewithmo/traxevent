'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { duplicateEvent } from '@/actions/camps'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DuplicateEventButtonProps {
  orgId: string
  orgSlug: string
  sourceCampId: string
  sourceName: string
}

export function DuplicateEventButton({ orgId, orgSlug, sourceCampId, sourceName }: DuplicateEventButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
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
      const camp = await duplicateEvent(orgId, sourceCampId, { name: name.trim(), year, camp_start: start, camp_end: end })
      router.push(`/${orgSlug}/${camp.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={(e) => { e.preventDefault(); setOpen(true) }}>
        Duplicate
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3" onClick={(e) => e.preventDefault()}>
      <div className="space-y-1">
        <Label htmlFor={`dup-name-${sourceCampId}`} className="text-xs">New event name</Label>
        <Input id={`dup-name-${sourceCampId}`} value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`dup-year-${sourceCampId}`} className="text-xs">Year</Label>
          <Input id={`dup-year-${sourceCampId}`} type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`dup-start-${sourceCampId}`} className="text-xs">Start</Label>
          <Input id={`dup-start-${sourceCampId}`} type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`dup-end-${sourceCampId}`} className="text-xs">End</Label>
          <Input id={`dup-end-${sourceCampId}`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Copies settings, assignment slots, and forms. Registrants are not copied.</p>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleDuplicate} disabled={busy || !name.trim() || !start || !end}>
          {busy ? 'Duplicating…' : 'Create duplicate'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
      </div>
    </div>
  )
}
