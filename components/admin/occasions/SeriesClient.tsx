'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSeries, extendSeries, endSeries } from '@/actions/series'
import { updateEvent } from '@/actions/events'
import type { Event, EventSeries } from '@/lib/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SeriesClient({
  orgId, orgSlug, series, days, isAdmin,
}: {
  orgId: string
  orgSlug: string
  series: EventSeries
  days: Event[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(series.name)
  const [locationName, setLocationName] = useState(series.location.name)
  const [address, setAddress] = useState(series.location.address ?? '')
  const [start, setStart] = useState(series.hours.start)
  const [end, setEnd] = useState(series.hours.end)
  const [fee, setFee] = useState(series.booth_fee != null ? String(series.booth_fee) : '')
  const [propagate, setPropagate] = useState(false)
  const [extendUntil, setExtendUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleSkip(day: Event) {
    if (!window.confirm(`Skip ${day.event_start}? The day is archived and stays skipped.`)) return
    const ok = await run(() => updateEvent(orgId, day.id, { status: 'archived' }))
    if (ok) setSkippedIds((prev) => new Set(prev).add(day.id))
  }

  async function handleSave() {
    const ok = await run(() =>
      updateSeries(orgId, series.id, {
        name,
        location: { name: locationName, ...(address.trim() ? { address } : {}) },
        hours: { start, end },
        booth_fee: fee !== '' ? Number(fee) : null,
      }, { propagate })
    )
    if (ok) setEditing(false)
  }

  async function handleExtend() {
    const ok = await run(() => extendSeries(orgId, series.id, extendUntil))
    if (ok) setExtendUntil('')
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
          <h1 className="text-2xl font-bold">{series.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every {WEEKDAYS[series.recurrence.weekday]} · {series.hours.start}–{series.hours.end} · {series.location.name}
            {series.booth_fee != null ? ` · $${series.booth_fee} booth` : ''} ·{' '}
            {series.active ? 'Active' : 'Ended'} through {series.recurrence.until}
          </p>
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit series</Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive" aria-live="polite">{error}</p>}

      {editing && (
        <div className="mt-4 grid max-w-md gap-2 rounded-xl border bg-white p-4">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="s-loc">Location name</Label>
          <Input id="s-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          <Label htmlFor="s-addr">Address (optional)</Label>
          <Input id="s-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s-start">Opens</Label>
              <Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-end">Closes</Label>
              <Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Label htmlFor="s-fee">Booth fee ($)</Label>
          <Input id="s-fee" type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            Apply to remaining days
          </label>
          <div className="mt-2 flex gap-2">
            <Button disabled={busy} onClick={handleSave}>
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-2">
        {days.map((d) => {
          const status = skippedIds.has(d.id) ? 'archived' : d.status
          return (
            <div key={d.id} data-testid={`day-${d.id}`} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${status === 'archived' ? 'opacity-60' : ''}`}>
              <Link href={`/${orgSlug}/${d.slug}/dashboard`} className="min-w-0 flex-1">
                <span className="font-medium">{d.event_start}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {status === 'archived' ? 'Skipped' : status === 'active' ? 'On' : status}
                </span>
              </Link>
              {isAdmin && status !== 'archived' && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => handleSkip(d)}>Skip</Button>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && series.active && (
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="s-extend">Extend through</Label>
            <Input id="s-extend" type="date" value={extendUntil} onChange={(e) => setExtendUntil(e.target.value)} />
          </div>
          <Button variant="outline" disabled={busy || !extendUntil} onClick={handleExtend}>
            Extend
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End the season? Remaining future days will be archived.')) {
                run(() => endSeries(orgId, series.id))
              }
            }}
          >
            End season
          </Button>
        </div>
      )}
    </div>
  )
}
