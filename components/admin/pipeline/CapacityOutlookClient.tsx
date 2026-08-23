'use client'

import Link from 'next/link'
import { kindLabel } from '@/lib/capacity/labels'
import { weekdayOf } from '@/lib/capacity/serviceable'
import type { CapacityMonth, CapacitySlot } from '@/lib/capacity/forecast'
import type { ScheduleCell, ScheduleLane } from '@/lib/capacity/schedule'
import type { CapacityUnitKind, Org } from '@/lib/types'

interface CapacityOutlookClientProps {
  orgSlug: string
  /** Per-month forecast from `forecastByMonth`, already computed on the server. */
  forecast: CapacityMonth[]
  /** Per-unit schedule lanes from `buildSchedule`; absent ⇒ no schedule section. */
  schedule?: ScheduleLane[]
  /** The operator's kind vocabulary; absent per-kind ⇒ neutral platform defaults. */
  resourceLabels?: Org['resource_labels']
}

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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

export function CapacityOutlookClient({ orgSlug, forecast, schedule, resourceLabels }: CapacityOutlookClientProps) {
  const org = { resource_labels: resourceLabels }
  // Everything closed / no units of any kind across the whole window — the
  // forecast is honest but empty. Point the operator at the one lever.
  const noCapacity = forecast.every((m) => m.cart.ceiling === 0 && m.room.ceiling === 0)
  // Only show a kind's meter if the org actually runs that kind — a mobile-only
  // operator (e.g. mobile beverage) shouldn't read "0 of 0 rooms" every month.
  const hasMobile = forecast.some((m) => m.cart.ceiling > 0)
  const hasVenue = forecast.some((m) => m.room.ceiling > 0)

  return (
    <div className="space-y-8">
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
            <MonthRow key={m.ym} month={m} org={org} hasMobile={hasMobile} hasVenue={hasVenue} />
          ))}
        </ul>
      </section>

      {schedule && schedule.length > 0 && (
        <ScheduleSection orgSlug={orgSlug} lanes={schedule} org={org} />
      )}
    </div>
  )
}

function MonthRow({ month, org, hasMobile, hasVenue }: { month: CapacityMonth; org: Pick<Org, 'resource_labels'>; hasMobile: boolean; hasVenue: boolean }) {
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
          {hasMobile && <KindMeter slot={month.cart} noun={kindLabel(org, 'mobile', month.cart.ceiling === 1 ? 1 : 2)} />}
          {hasVenue && <KindMeter slot={month.room} noun={kindLabel(org, 'venue', month.room.ceiling === 1 ? 1 : 2)} />}
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

function KindMeter({ slot, noun }: { slot: CapacitySlot; noun: string }) {
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
        aria-label={`${noun}: ${slot.booked} of ${slot.ceiling} booked, ${slot.open} open`}
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

/* ── Schedule: read-only unit × date status grid ─────────────────────────────
   Rows are units (grouped mobile-then-venue under kindLabel headers) plus a
   trailing Unassigned lane. Cells are a four-state STATUS grid — booked / open /
   closed / blocked — each distinguishable without relying on colour alone
   (booked carries the lead title + link; blocked is hatched; closed is muted +
   named in its tooltip). Booked blocks are the ink; everything else recedes.  */

type CellState = 'booked' | 'blocked' | 'closed' | 'open'

/** Precedence: a real booking always shows (even a one-off on a closed day),
    then a blocked unit, then a closed day, else open. */
function cellState(cell: ScheduleCell): CellState {
  if (cell.leadId) return 'booked'
  if (!cell.unitAvailable) return 'blocked'
  if (!cell.serviceable) return 'closed'
  return 'open'
}

/** "Sep 5" from an ISO ymd, timezone-safe (parts, never `new Date(str)`). */
function fmtShort(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTH_ABBR[m - 1] ?? '?'} ${d}`
}

/** The 45° hatch the kit reserves for "unavailable" — reads under CVD + print. */
const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in oklab, var(--muted-foreground) 40%, transparent) 0 1.5px, transparent 1.5px 5px)'

function ScheduleSection({
  orgSlug,
  lanes,
  org,
}: {
  orgSlug: string
  lanes: ScheduleLane[]
  org: Pick<Org, 'resource_labels'>
}) {
  // Group the unit lanes by kind, preserving input order; the unassigned lane
  // is pulled out and rendered last in its own warning-toned group.
  const unitLanes = lanes.filter((l) => l.kind !== 'unassigned')
  const unassigned = lanes.find((l) => l.kind === 'unassigned')
  const groups: { kind: CapacityUnitKind; title: string; lanes: ScheduleLane[] }[] = []
  for (const kind of ['mobile', 'venue'] as CapacityUnitKind[]) {
    const inKind = unitLanes.filter((l) => l.kind === kind)
    if (inKind.length === 0) continue
    const many = kindLabel(org, kind, 2)
    groups.push({ kind, title: many.charAt(0).toUpperCase() + many.slice(1), lanes: inKind })
  }

  return (
    <section aria-labelledby="tx-outlook-schedule" className="space-y-3">
      <div className="space-y-1">
        <h2 id="tx-outlook-schedule" className="text-base font-semibold text-foreground">
          What&rsquo;s booked where
        </h2>
        <p className="text-sm text-muted-foreground">
          Each {kindLabel(org, 'mobile', 1)} and {kindLabel(org, 'venue', 1)} as its own lane. Filled blocks are booked;{' '}
          <span className="whitespace-nowrap">hatched = unavailable</span>, muted = closed.
        </p>
      </div>

      {/* Desktop / tablet: the day-grid. Horizontal scroll is contained HERE,
          inside its own overflow container — never the page body. */}
      <ScheduleGrid orgSlug={orgSlug} groups={groups} unassigned={unassigned} />

      {/* Mobile: a crushed grid is unreadable — degrade to a per-unit list of
          upcoming bookings (identity first, dates as a running line). */}
      <ScheduleList orgSlug={orgSlug} groups={groups} unassigned={unassigned} />
    </section>
  )
}

function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-[3px] border"
          style={{
            background: 'color-mix(in oklab, var(--primary) 16%, var(--card))',
            borderColor: 'color-mix(in oklab, var(--primary) 45%, transparent)',
          }}
        />
        Booked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[3px] border border-border bg-card" />
        Open
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[3px] border border-border bg-muted" />
        Closed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[3px] border border-border" style={{ backgroundImage: HATCH }} />
        Unavailable
      </span>
    </div>
  )
}

function ScheduleGrid({
  orgSlug,
  groups,
  unassigned,
}: {
  orgSlug: string
  groups: { kind: CapacityUnitKind; title: string; lanes: ScheduleLane[] }[]
  unassigned?: ScheduleLane
}) {
  // Every lane shares the same date axis — read it off the first available lane.
  const dates = (groups[0]?.lanes[0] ?? unassigned)?.cells.map((c) => c.date) ?? []
  const colCount = dates.length

  return (
    <div className="hidden space-y-3 md:block">
      <ScheduleLegend />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-40 border-b border-border bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
              >
                Unit
              </th>
              {dates.map((d) => {
                const [, , day] = d.split('-').map(Number)
                const wd = WEEKDAY_LETTER[weekdayOf(d)]
                const first = day === 1
                return (
                  <th
                    key={d}
                    scope="col"
                    className="w-[52px] min-w-[52px] border-b border-border bg-card px-0 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    <span className="block leading-none opacity-70">{wd}</span>
                    <span className="block leading-tight tabular-nums text-foreground">
                      {first ? fmtShort(d) : day}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.kind} orgSlug={orgSlug} title={g.title} lanes={g.lanes} colCount={colCount} />
            ))}
            {unassigned && (
              <GroupRows
                orgSlug={orgSlug}
                title="Unassigned"
                lanes={[unassigned]}
                colCount={colCount}
                warn
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupRows({
  orgSlug,
  title,
  lanes,
  colCount,
  warn = false,
}: {
  orgSlug: string
  title: string
  lanes: ScheduleLane[]
  colCount: number
  warn?: boolean
}) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={colCount + 1}
          className="border-b border-border bg-muted/60 px-3 py-1.5 text-left"
        >
          <span
            className={`sticky left-0 text-xs font-semibold uppercase tracking-[.05em] ${
              warn ? 'text-[var(--status-alert-fg)]' : 'text-muted-foreground'
            }`}
          >
            {title}
            {warn && lanes[0]?.cells.some((c) => c.leadId) && (
              <span className="ml-1.5 font-medium normal-case tracking-normal">— still needs a unit</span>
            )}
          </span>
        </th>
      </tr>
      {lanes.map((lane) => (
        <tr key={lane.unitId}>
          <th
            scope="row"
            className="sticky left-0 z-10 w-40 border-b border-border bg-card px-3 py-1.5 text-left align-middle font-medium text-foreground"
          >
            <span className="block truncate">{lane.unitName}</span>
          </th>
          {lane.cells.map((cell) => (
            <ScheduleGridCell key={cell.date} orgSlug={orgSlug} unitName={lane.unitName} cell={cell} />
          ))}
        </tr>
      ))}
    </>
  )
}

function ScheduleGridCell({
  orgSlug,
  unitName,
  cell,
}: {
  orgSlug: string
  unitName: string
  cell: ScheduleCell
}) {
  const state = cellState(cell)
  const label = fmtShort(cell.date)
  const base = 'border-b border-l border-border p-0.5 align-middle h-9'

  if (state === 'booked') {
    return (
      <td className={base} title={`${unitName} · ${label} · ${cell.leadTitle}`}>
        <Link
          href={`/${orgSlug}/leads/${cell.leadId}`}
          className="flex h-full items-center overflow-hidden rounded-[4px] border px-1 text-[11px] font-medium leading-tight text-foreground no-underline transition-colors hover:brightness-95"
          style={{
            background: 'color-mix(in oklab, var(--primary) 16%, var(--card))',
            borderColor: 'color-mix(in oklab, var(--primary) 45%, transparent)',
          }}
        >
          <span className="truncate">{cell.leadTitle}</span>
        </Link>
      </td>
    )
  }

  if (state === 'blocked') {
    return (
      <td
        className={base}
        title={`${unitName} · ${label} · Unavailable`}
        aria-label={`${unitName}, ${label}: unavailable`}
      >
        <div className="h-full w-full rounded-[4px] border border-border" style={{ backgroundImage: HATCH }} />
      </td>
    )
  }

  if (state === 'closed') {
    return (
      <td className={base} title={`${unitName} · ${label} · Closed`} aria-label={`${unitName}, ${label}: closed`}>
        <div className="h-full w-full rounded-[4px] bg-muted" />
      </td>
    )
  }

  return (
    <td className={base} title={`${unitName} · ${label} · Open`} aria-label={`${unitName}, ${label}: open`}>
      <div className="h-full w-full rounded-[4px]" />
    </td>
  )
}

/** Mobile fallback: one block per unit, its bookings as a running line. */
function ScheduleList({
  orgSlug,
  groups,
  unassigned,
}: {
  orgSlug: string
  groups: { kind: CapacityUnitKind; title: string; lanes: ScheduleLane[] }[]
  unassigned?: ScheduleLane
}) {
  const renderLane = (lane: ScheduleLane, warn: boolean) => {
    const booked = lane.cells.filter((c) => c.leadId)
    return (
      <div key={lane.unitId} className="rounded-lg border border-border bg-card px-3 py-2">
        <p className="text-sm font-medium text-foreground">{lane.unitName}</p>
        {booked.length === 0 ? (
          <p className="text-xs text-muted-foreground">No bookings in the weeks ahead</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {booked.map((c) => (
              <li key={c.date} className="whitespace-nowrap">
                <Link
                  href={`/${orgSlug}/leads/${c.leadId}`}
                  className={`no-underline hover:underline ${warn ? 'text-[var(--status-alert-fg)]' : 'text-foreground'}`}
                >
                  <span className="font-medium tabular-nums">{fmtShort(c.date)}</span>{' '}
                  <span className="text-muted-foreground">{c.leadTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 md:hidden">
      {groups.map((g) => (
        <div key={g.kind} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[.05em] text-muted-foreground">{g.title}</p>
          {g.lanes.map((lane) => renderLane(lane, false))}
        </div>
      ))}
      {unassigned && unassigned.cells.some((c) => c.leadId) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[.05em] text-[var(--status-alert-fg)]">
            Unassigned — still needs a unit
          </p>
          {renderLane(unassigned, true)}
        </div>
      )}
    </div>
  )
}
