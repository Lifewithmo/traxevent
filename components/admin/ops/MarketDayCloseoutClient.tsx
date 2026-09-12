'use client'

// Closeout-lite: the plan-less market-day money screen (spec 2026-08-23 S1.2).
// Job: "the market's over — bank today's number and be done", one-handed on a
// phone at the van. Budget: 1 screen · 2 inputs · 1 tap (Mark complete saves
// AND completes). The deciding number is the NET, recomputed live through the
// same marketDayCloseoutSummary branch the server runs, so the figure shown
// here, on the overview tile, and on the season strip cannot disagree.
//
// Inc-3 S2 (BINDING B4): a Square Transactions-CSV can PREFILL the sales
// field. Typing stays primary — the attach input is the secondary path for
// the same field. Budget honesty (B4, asserted in the test flow): the import
// is 2 in-app taps (Attach → Mark the day complete) + the OS file pick; it
// kills the typo, not the dashboard trip. The parsed EVIDENCE renders as the
// caption under the field — the caption IS the confirmation, no modal — and
// provenance rides the save as OpsActuals.sales_source (B3) so the figure
// stays labeled as imported at every later render.
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill } from '@/components/ui/status-pill'
import { saveActuals, completeCloseout } from '@/actions/event-ops'
import { marketDayCloseoutSummary } from '@/lib/ops/derive'
import { parseSquareTransactionsCsv, type SquareCsvError, type SquareCsvPrefill } from '@/lib/square-csv'
import type { OpsCloseout, OpsResource } from '@/lib/types'

/** Whole dollars stay whole ("$45", "Net $141"); cents only when they exist. */
function money(n: number): string {
  const abs = Math.abs(n)
  const rounded = Math.round(abs * 100) / 100
  const s = Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`
  return n < 0 ? `−${s}` : s
}

// ── Zone-safe date labels (composed from the YYYY-MM-DD string via UTC —
// never toLocaleDateString: market-day dates are calendar days, and a viewer
// west of the venue must not see them shift; same rule as the SSR time sweep).
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function utcDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
}
/** "Sat Aug 22" */
function shortDate(ymd: string): string {
  const d = utcDate(ymd)
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}
/** Evidence money is exact: always cents, grouped — "$1,243.50". */
function evidenceMoney(n: number): string {
  const s = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return n < 0 ? `−${s}` : s
}

/** "Sat Aug 22 · 47 payments · $1,243.50 Total Collected (gross)" — the
 *  evidence caption (B4). Refund rows subtract from the total (documented in
 *  lib/square-csv.ts), so when present they are disclosed, not hidden. */
function evidenceCaption(e: SquareCsvPrefill): string {
  const payments = e.rowCount - e.refundCount
  const rows = e.refundCount > 0
    ? `${payments} payment${payments === 1 ? '' : 's'} − ${e.refundCount} refund${e.refundCount === 1 ? '' : 's'}`
    : `${e.rowCount} payment${e.rowCount === 1 ? '' : 's'}`
  return `${shortDate(e.dateMatched)} · ${rows} · ${evidenceMoney(e.total)} Total Collected (gross)`
}

/** Designed failure per parser error (B4) — never a raw error string. */
function importErrorCopy(error: SquareCsvError, eventDate: string): string {
  switch (error) {
    case 'no_rows_for_date':
      return `No ${shortDate(eventDate)} rows in this export — check the date range on the Square dashboard.`
    case 'empty_file':
      return 'That file is empty — export the Transactions CSV from Square’s dashboard.'
    case 'unrecognized_layout':
    case 'unreadable_money':
      return 'Couldn’t read this export — choose the Transactions CSV from Square’s dashboard.'
  }
}

/** "Last Saturday: $180" when the prior day is the same weekday within a
 *  week (the weekly-market common case); otherwise the honest dated form. */
function ghostHintLabel(priorDate: string, eventDate: string): string {
  const gapDays = Math.round((utcDate(eventDate).getTime() - utcDate(priorDate).getTime()) / 86400000)
  const sameWeekday = utcDate(priorDate).getUTCDay() === utcDate(eventDate).getUTCDay()
  if (sameWeekday && gapDays > 0 && gapDays <= 7) return `Last ${WEEKDAYS_LONG[utcDate(priorDate).getUTCDay()]}`
  return `Last market day (${shortDate(priorDate).slice(4)})`
}

export interface MarketDayCloseoutClientProps {
  orgId: string
  eventId: string
  boothFee: number
  /** YYYY-MM-DD — the day a Square export's rows are filtered to (B4). */
  eventDate: string
  closeout: OpsCloseout | null
  /** Only non-empty when the closeout doc already carries consumable actuals
   *  (not something this screen records) — needed to cost them exactly like
   *  the server branch does. Usually []. */
  resources: OpsResource[]
  /** The series' prior day with saved sales — the ghost hint under the sales
   *  input ("Last Saturday: $180"). Absent/null when the day isn't
   *  series-generated, no prior day holds sales, or the soft-failing lookup
   *  failed (B4: rendered only when the data is in reach, omitted otherwise). */
  priorDay?: { date: string; sales: number } | null
}

export function MarketDayCloseoutClient(props: MarketDayCloseoutClientProps) {
  const { orgId, eventId, boothFee, eventDate } = props
  const saved = props.closeout?.actuals
  const savedConsumables = useMemo(() => saved?.consumables ?? [], [saved])

  const [sales, setSales] = useState(saved?.sales !== undefined ? String(saved.sales) : '')
  const [waste, setWaste] = useState(saved?.waste_notes ?? '')
  const [completed, setCompleted] = useState(props.closeout?.completed ?? false)
  const [busy, setBusy] = useState<'save' | 'complete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  // Provenance of the CURRENT figure in the sales field (B3). Seeded from the
  // saved doc so a reloaded imported figure stays labeled; a fresh import
  // carries its full evidence, a reloaded one only the fine-print label.
  const [salesSource, setSalesSource] = useState<'square_csv' | 'manual'>(
    saved?.sales_source === 'square_csv' && saved?.sales !== undefined ? 'square_csv' : 'manual',
  )
  const [evidence, setEvidence] = useState<SquareCsvPrefill | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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
      // Provenance travels WITH the number (B3): whenever sales is written,
      // its source is written — 'square_csv' for an untouched prefill,
      // 'manual' otherwise (also what overwrites a stale imported label
      // after the operator retypes the figure).
      ...(salesValid ? { sales: salesNum, sales_source: salesSource } : {}),
      ...(waste.trim() ? { waste_notes: waste.trim() } : {}),
    }
  }

  /** Attach a Square Transactions CSV → prefill the sales field. The evidence
   *  caption under the field is the confirmation (B4 — no modal). */
  async function handleSquareFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be re-picked after a fix
    if (!file) return
    setImportError(null)
    let text: string
    try {
      text = await file.text()
    } catch {
      setImportError('Couldn’t read that file — try exporting it from Square again.')
      return
    }
    const result = parseSquareTransactionsCsv(text, eventDate)
    if (!result.ok) {
      setImportError(importErrorCopy(result.error, eventDate))
      return
    }
    setSales(String(result.total))
    setSalesSource('square_csv')
    setEvidence(result)
    setSavedNote(false)
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
          onChange={(e) => {
            setSales(e.target.value)
            // Provenance honesty (B3): the moment the operator types over a
            // prefill, the figure is no longer Square's — flip the source
            // back to 'manual' and drop the evidence caption (it would
            // attest to a number that's no longer shown).
            setSalesSource('manual')
            setEvidence(null)
            setSavedNote(false)
          }}
        />
        {evidence ? (
          // The evidence caption IS the confirmation (B4 — no modal): what
          // day matched, how many rows, and the exact gross that landed.
          <p role="status" className="mt-1 text-xs text-muted-foreground">{evidenceCaption(evidence)}</p>
        ) : salesSource === 'square_csv' ? (
          // Post-reload: the saved figure came from an import (B3 field) —
          // keep it labeled even though the row-level evidence is gone.
          <p className="mt-1 text-xs text-muted-foreground">Imported from a Square export.</p>
        ) : props.priorDay && !completed ? (
          // Ghost hint: the series' prior closed day — a sanity anchor for
          // the number about to be typed, never a value that self-enters.
          <p className="mt-1 text-xs text-muted-foreground">
            {ghostHintLabel(props.priorDay.date, eventDate)}: {money(props.priorDay.sales)}
          </p>
        ) : null}
        {evidence && evidence.currencyWarnings.length > 0 && (
          <p className="mt-1 text-xs text-[var(--warn-fg)]">{evidence.currencyWarnings.join(' ')}</p>
        )}
      </div>

      {/* Secondary path to the same field: typing stays primary. Flow budget
          (B4, honest): 2 in-app taps — Attach, then Mark the day complete —
          plus the OS file pick between them. */}
      {!completed && (
        <div>
          <Label htmlFor="md-co-square" className="text-muted-foreground">Attach Square export (optional)</Label>
          <Input
            id="md-co-square"
            type="file"
            accept=".csv,text/csv"
            className="mt-1 h-11"
            onChange={handleSquareFile}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Prefills today&apos;s sales from the Transactions CSV — kills the typo, not the dashboard trip.
          </p>
          {importError && (
            <p role="alert" className="mt-1 text-sm text-destructive">{importError}</p>
          )}
        </div>
      )}

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
