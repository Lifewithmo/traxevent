'use client'

// Closeout-lite: the plan-less market-day money screen (spec 2026-08-23 S1.2).
// Job: "the market's over — bank today's number and be done", one-handed on a
// phone at the van. Budget: 1 screen · 2 inputs · 1 tap (Mark complete saves
// AND completes). The deciding number is the NET, recomputed live through the
// same marketDayCloseoutSummary branch the server runs, so the figure shown
// here, on the overview tile, and on the season strip cannot disagree.
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill } from '@/components/ui/status-pill'
import { saveActuals, completeCloseout } from '@/actions/event-ops'
import { marketDayCloseoutSummary } from '@/lib/ops/derive'
import type { OpsCloseout, OpsResource } from '@/lib/types'

/** Whole dollars stay whole ("$45", "Net $141"); cents only when they exist. */
function money(n: number): string {
  const abs = Math.abs(n)
  const rounded = Math.round(abs * 100) / 100
  const s = Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`
  return n < 0 ? `−${s}` : s
}

export interface MarketDayCloseoutClientProps {
  orgId: string
  eventId: string
  boothFee: number
  closeout: OpsCloseout | null
  /** Only non-empty when the closeout doc already carries consumable actuals
   *  (not something this screen records) — needed to cost them exactly like
   *  the server branch does. Usually []. */
  resources: OpsResource[]
}

export function MarketDayCloseoutClient(props: MarketDayCloseoutClientProps) {
  const { orgId, eventId, boothFee } = props
  const saved = props.closeout?.actuals
  const savedConsumables = useMemo(() => saved?.consumables ?? [], [saved])

  const [sales, setSales] = useState(saved?.sales !== undefined ? String(saved.sales) : '')
  const [waste, setWaste] = useState(saved?.waste_notes ?? '')
  const [completed, setCompleted] = useState(props.closeout?.completed ?? false)
  const [busy, setBusy] = useState<'save' | 'complete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const salesNum = Number(sales)
  const salesValid = sales !== '' && Number.isFinite(salesNum) && salesNum >= 0

  // Live recompute — the exact server branch (packages=[], consumable cost
  // from already-saved actuals only, revenue = sales, fees = booth fee).
  const summary = useMemo(
    () =>
      salesValid
        ? marketDayCloseoutSummary({
            resources: props.resources,
            actual_consumables: savedConsumables,
            sales: salesNum,
            booth_fee: boothFee,
          })
        : null,
    [salesValid, salesNum, boothFee, props.resources, savedConsumables],
  )

  function payload() {
    return {
      ...(salesValid ? { sales: salesNum } : {}),
      ...(waste.trim() ? { waste_notes: waste.trim() } : {}),
    }
  }

  async function handleSave() {
    setBusy('save'); setError(null); setSavedNote(false)
    try {
      await saveActuals(orgId, eventId, payload())
      setSavedNote(true)
    } catch (err: unknown) {
      setError(`${err instanceof Error ? err.message : 'Failed to save'} — nothing recorded, tap again to retry.`)
    } finally {
      setBusy(null)
    }
  }

  /** The one tap: record what's typed, then close the day. */
  async function handleComplete() {
    setBusy('complete'); setError(null); setSavedNote(false)
    try {
      await saveActuals(orgId, eventId, payload())
      await completeCloseout(orgId, eventId)
      setCompleted(true)
    } catch (err: unknown) {
      setError(`${err instanceof Error ? err.message : 'Failed to complete'} — tap again to retry.`)
    } finally {
      setBusy(null)
    }
  }

  const net = summary?.actual_margin ?? 0
  const consumableCost = summary?.actual_consumable_cost ?? 0
  const interpretation = !summary
    ? null
    : [
        boothFee > 0
          ? net < 0
            ? `today's sales didn't cover the ${money(boothFee)} booth fee`
            : `after the ${money(boothFee)} booth fee`
          : 'no booth fee on this day',
        consumableCost > 0 ? `and ${money(consumableCost)} of recorded consumables` : null,
      ]
        .filter(Boolean)
        .join(' ')

  return (
    <div className="max-w-md space-y-6 p-5 pb-16">
      <div>
        <h2 className="text-lg font-semibold">Close out the day</h2>
        {completed && (
          <StatusPill tone="confirmed" className="mt-2">Day closed out.</StatusPill>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      <div>
        <Label htmlFor="md-co-sales">Today&apos;s sales ($)</Label>
        <Input
          id="md-co-sales"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          className="mt-1 h-11 text-lg"
          value={sales}
          onChange={(e) => { setSales(e.target.value); setSavedNote(false) }}
        />
      </div>

      {/* The focal element: the net, interpreted — never a bare figure. */}
      <div aria-live="polite">
        {summary ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
              Today&apos;s net
            </p>
            <p className={`text-3xl font-bold tabular-nums ${net < 0 ? 'text-destructive' : 'text-[var(--money-green)]'}`}>
              {money(net)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{interpretation}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {boothFee > 0
              ? `Type today's sales — the ${money(boothFee)} booth fee comes off the top.`
              : 'Type today’s sales to see the net.'}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="md-co-waste">Waste notes (optional)</Label>
        <Input
          id="md-co-waste"
          className="mt-1 h-11"
          placeholder="e.g. dumped 2 gal cold brew"
          value={waste}
          onChange={(e) => { setWaste(e.target.value); setSavedNote(false) }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {!completed && (
          <Button size="touch" onClick={handleComplete} disabled={busy !== null || !salesValid}>
            {busy === 'complete' ? 'Closing out…' : 'Mark the day complete'}
          </Button>
        )}
        <Button
          variant="outline"
          size="touch"
          onClick={handleSave}
          disabled={busy !== null || (!salesValid && !waste.trim())}
        >
          {busy === 'save' ? 'Saving…' : completed ? 'Save changes' : 'Save without completing'}
        </Button>
        {savedNote && !error && (
          <p role="status" className="text-sm text-muted-foreground">Saved.</p>
        )}
        {!completed && !salesValid && (
          <p className="text-xs text-muted-foreground">
            Completing needs today&apos;s sales — even $0 counts.
          </p>
        )}
      </div>
    </div>
  )
}
