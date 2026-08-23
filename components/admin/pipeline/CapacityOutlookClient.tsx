'use client'

import { kindLabel } from '@/lib/capacity/labels'
import type { CapacityMonth, CapacitySlot } from '@/lib/capacity/forecast'
import type { CapacityUnitKind, Org } from '@/lib/types'

interface CapacityOutlookClientProps {
  orgSlug: string
  /** Per-month forecast from `forecastByMonth`, already computed on the server. */
  forecast: CapacityMonth[]
  /** The operator's kind vocabulary; absent per-kind ⇒ neutral platform defaults. */
  resourceLabels?: Org['resource_labels']
}

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Full month name (+ year when it isn't the current calendar year) from a `ym`. */
function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const name = MONTH_FULL[m - 1] ?? ym
  const thisYear = new Date().getFullYear()
  return y === thisYear ? name : `${name} ${y}`
}

/**
 * The `~$` headroom estimate as a compact hero figure: `~$9k` past a thousand,
 * `~$450` below it. Rounded — it is an estimate (open slots × average value),
 * signalled by the leading `~`, never a precise sum.
 */
function compactHeadroom(value: number): string {
  if (value >= 1000) return `~$${Math.round(value / 1000)}k`
  return `~$${Math.round(value)}`
}

export function CapacityOutlookClient({ orgSlug: _orgSlug, forecast, resourceLabels }: CapacityOutlookClientProps) {
  const org = { resource_labels: resourceLabels }
  // Everything closed / no units of any kind across the whole window — the
  // forecast is honest but empty. Point the operator at the one lever.
  const noCapacity = forecast.every((m) => m.cart.ceiling === 0 && m.room.ceiling === 0)

  return (
    <section aria-labelledby="tx-outlook-forecast" className="space-y-4">
      <div className="space-y-1">
        <h2 id="tx-outlook-forecast" className="text-base font-semibold text-foreground">
          Open capacity, month by month
        </h2>
        <p className="text-sm text-muted-foreground">
          Booked against your ceiling, counted only over the days you actually work. The{' '}
          <span className="font-medium text-[var(--money-green)]">headroom</span> is what you can still sell.
        </p>
      </div>

      {noCapacity && (
        <p
          role="status"
          className="rounded-lg bg-[var(--status-pending-bg)] px-3 py-2 text-sm font-medium text-[var(--status-pending-fg)]"
        >
          No open capacity in this window. Check your working days and units under Settings → Resources &amp; capacity.
        </p>
      )}

      <ul className="space-y-2.5">
        {forecast.map((m) => (
          <MonthRow key={m.ym} month={m} org={org} />
        ))}
      </ul>
    </section>
  )
}

function MonthRow({ month, org }: { month: CapacityMonth; org: Pick<Org, 'resource_labels'> }) {
  const hasHeadroom = month.headroomValue > 0
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        {/* Identity: the month + its working-day context. */}
        <div className="sm:w-40 sm:shrink-0">
          <p className="font-semibold text-foreground">{monthTitle(month.ym)}</p>
          <p className="text-xs text-muted-foreground">
            over {month.serviceableDays} working day{month.serviceableDays === 1 ? '' : 's'}
          </p>
        </div>

        {/* The two part-of-whole meters — booked filled against the ceiling. */}
        <div className="min-w-0 flex-1 space-y-2.5">
          <KindMeter slot={month.cart} noun={kindLabel(org, 'mobile', month.cart.ceiling === 1 ? 1 : 2)} kind="mobile" />
          <KindMeter slot={month.room} noun={kindLabel(org, 'venue', month.room.ceiling === 1 ? 1 : 2)} kind="venue" />
        </div>

        {/* The sellable story: headroom as the hero figure (money-green). */}
        {hasHeadroom && (
          <div className="sm:w-24 sm:shrink-0 sm:text-right">
            <p
              className="text-xl font-semibold tabular-nums tracking-[-.02em] text-[var(--money-green)]"
              title={`Estimated open value: ${compactHeadroom(month.headroomValue)}`}
            >
              {compactHeadroom(month.headroomValue)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">headroom</p>
          </div>
        )}
      </div>
    </li>
  )
}

function KindMeter({ slot, noun, kind }: { slot: CapacitySlot; noun: string; kind: CapacityUnitKind }) {
  // Honest ratio: booked filled against the ceiling; open = the remaining track.
  const pct = slot.ceiling > 0 ? Math.round((slot.booked / slot.ceiling) * 100) : 0
  const full = slot.ceiling > 0 && slot.open === 0
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-semibold tabular-nums text-foreground">{slot.open}</span>
          <span className="text-muted-foreground"> of </span>
          <span className="tabular-nums text-foreground">{slot.ceiling}</span>{' '}
          <span className="text-muted-foreground">{noun} open</span>
        </span>
        {full && slot.ceiling > 0 && (
          <span className="shrink-0 text-xs font-medium text-[var(--status-pending-fg)]">full</span>
        )}
      </div>
      {/* Thin rounded meter: recessive track, booked fill to booked/ceiling. */}
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${kind === 'mobile' ? 'Serving units' : 'Rooms'}: ${slot.booked} of ${slot.ceiling} booked, ${slot.open} open`}
        title={`${slot.booked} booked · ${slot.open} open · ${slot.ceiling} total`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'color-mix(in oklab, var(--primary) 60%, var(--muted-foreground))',
          }}
        />
      </div>
    </div>
  )
}
