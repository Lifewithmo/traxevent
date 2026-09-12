'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SERIES_ROLLUP_CAP } from '@/lib/event-ui'
import { updateSeries, extendSeries, endSeries } from '@/actions/series'
import { updateEvent } from '@/actions/events'
import type { Event, EventSeries } from '@/lib/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Whole dollars stay whole ("$45"); cents only when they exist. */
function fmtMoney(n: number): string {
  const abs = Math.abs(n)
  const rounded = Math.round(abs * 100) / 100
  const s = Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`
  return n < 0 ? `−${s}` : s
}

/** Per-day money facts, computed server-side through marketDayCloseoutSummary.
 *  'closed' = saved sales exist (counting rule: ANY saved sales counts —
 *  Mark-complete is optional; `consumables` = cost of recorded consumable
 *  actuals, present only when > 0 so the cell's equation stays true);
 *  'none' = read succeeded, no sales saved;
 *  'unknown' = the read FAILED — rendered as unknown, never as a $0 day;
 *  'beyond_cap' = never read — the day sits past the 30-day rollup. Distinct
 *  from 'unknown' on purpose: nothing failed, and the copy must say so. */
export type SeriesDayMoney =
  | { state: 'closed'; sales: number; fee: number; net: number; consumables?: number }
  | { state: 'none' }
  | { state: 'unknown' }
  | { state: 'beyond_cap' }

/** "sales − fee = net" cell for one day row; null = render nothing. */
function dayMoneyCell(m: SeriesDayMoney | undefined, dayPast: boolean): React.ReactNode {
  if (!m) return null
  if (m.state === 'unknown') {
    return <span className="text-xs text-muted-foreground" title="Couldn’t load this day’s closeout">—</span>
  }
  if (m.state === 'beyond_cap') {
    // Honest truncation, not a failure: the read was never attempted. Only a
    // past day owes the note — a future beyond-cap day has nothing to report.
    return dayPast
      ? <span className="text-xs text-muted-foreground" title={`The season rollup reads the most recent ${SERIES_ROLLUP_CAP} days — this day sits beyond it`}>beyond the {SERIES_ROLLUP_CAP}-day rollup</span>
      : null
  }
  if (m.state === 'none') {
    // Only a past day owes a number; a future day showing "not closed out" would nag.
    return dayPast ? <span className="text-xs text-muted-foreground">not closed out</span> : null
  }
  const netClass = m.net < 0 ? 'text-destructive' : 'text-[var(--money-green)]'
  const net = <span className={`font-medium ${netClass}`}>{fmtMoney(m.net)}</span>
  const costs = m.consumables ?? 0
  // Recorded consumable actuals are part of net — a two-term "sales − fee =
  // net" would be arithmetically false, so the costs term joins the equation.
  if (m.fee > 0) {
    return (
      <span
        className="text-sm tabular-nums text-muted-foreground"
        title={costs > 0 ? `${fmtMoney(m.sales)} sales − ${fmtMoney(m.fee)} booth fee − ${fmtMoney(costs)} recorded consumables` : undefined}
      >
        {fmtMoney(m.sales)} − {fmtMoney(m.fee)}{costs > 0 && <> − {fmtMoney(costs)}</>} = {net}
      </span>
    )
  }
  return (
    <span
      className="text-sm tabular-nums text-muted-foreground"
      title={costs > 0 ? `${fmtMoney(m.sales)} sales − ${fmtMoney(costs)} recorded consumables` : undefined}
    >
      net {net}
    </span>
  )
}

export function SeriesClient({
  orgId, orgSlug, series, days, isAdmin, money, today,
}: {
  orgId: string
  orgSlug: string
  series: EventSeries
  days: Event[]
  isAdmin: boolean
  /** Admin-only season money (absent for non-admins — B4 money gate). */
  money?: Record<string, SeriesDayMoney>
  /** Server-computed YYYY-MM-DD; gates the "not closed out" nudge to past days. */
  today?: string
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

  // Season totals: closed-out days only (any saved sales counts).
  const closedDays = money
    ? Object.values(money).filter((m): m is Extract<SeriesDayMoney, { state: 'closed' }> => m.state === 'closed')
    : []
  const seasonNet = closedDays.reduce((sum, m) => sum + m.net, 0)
  const positiveDays = closedDays.filter((m) => m.net > 0).length
  // Truncation disclosure: past days beyond the 30-day rollup hold money the
  // verdict cannot see — say so, rather than silently under-counting a season.
  const beyondCapPastDays = money && today
    ? days.filter((d) => money[d.id]?.state === 'beyond_cap' && d.event_start.slice(0, 10) <= today).length
    : 0

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
          {/* Season verdict — "is this market worth it", from closed-out days only. */}
          {closedDays.length > 0 ? (
            <p className="mt-1 text-sm font-medium tabular-nums">
              <span className={seasonNet < 0 ? 'text-destructive' : 'text-[var(--money-green)]'}>
                {seasonNet >= 0 ? '+' : ''}{fmtMoney(seasonNet)} net
              </span>{' '}
              over {closedDays.length} day{closedDays.length === 1 ? '' : 's'} ·{' '}
              {positiveDays} of {closedDays.length} day{closedDays.length === 1 ? '' : 's'} positive
            </p>
          ) : money ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No days closed out yet — the season net shows up here after the first closeout.
            </p>
          ) : null}
          {beyondCapPastDays > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Season money covers the most recent {SERIES_ROLLUP_CAP} days — {beyondCapPastDays} earlier day{beyondCapPastDays === 1 ? '' : 's'} not counted.
            </p>
          )}
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit series</Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive" aria-live="polite">{error}</p>}

      {editing && (
        <div className="mt-4 grid max-w-md gap-2 rounded-xl border bg-card p-4">
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
            <div key={d.id} data-testid={`day-${d.id}`} className={`flex items-center gap-3 rounded-xl border bg-card p-3 ${status === 'archived' ? 'opacity-60' : ''}`}>
              <Link href={`/${orgSlug}/${d.slug}/dashboard`} className="min-w-0 flex-1">
                <span className="font-medium">{d.event_start}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {status === 'archived' ? 'Skipped' : status === 'active' ? 'On' : status}
                </span>
              </Link>
              {/* Money column: skipped days owe nothing unless money was actually recorded. */}
              {(status !== 'archived' || money?.[d.id]?.state === 'closed') && (
                <span className="shrink-0 text-right">
                  {dayMoneyCell(money?.[d.id], !!today && d.event_start.slice(0, 10) <= today)}
                </span>
              )}
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
