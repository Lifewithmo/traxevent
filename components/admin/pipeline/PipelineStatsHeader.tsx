'use client'

import { useEffect, useState } from 'react'
import { KpiBand } from '@/components/ui/kpi-band'
import { PipelineStatTile } from '@/components/admin/pipeline/PipelineStatTile'
import { money } from '@/lib/pipeline-presentation'
import type { BacklogMonth } from '@/lib/pipeline-stats'

export interface PipelineHeaderStats {
  bookedThisMonth: { count: number; value: number }
  bookedLastYearSameMonth: { count: number; value: number }
  bookedNext90: { count: number; value: number }
  openPipeline: { count: number; value: number }
  needsActionCount: number
  backlog: BacklogMonth[]
  todayYm: string
}

// Year-over-year is only meaningful once last year's month has data;
// fall back to the plain won-count line until then.
function yoyLine(now: number, lastYear: number): { text: string; destructive: boolean } | null {
  if (lastYear <= 0) return null
  const pct = Math.round(((now - lastYear) / lastYear) * 100)
  if (pct === 0) return { text: 'even with this month last year', destructive: false }
  return {
    text: `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs this month last year`,
    destructive: pct < 0,
  }
}

function Backlog({ backlog, todayYm }: { backlog: BacklogMonth[]; todayYm: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(window.localStorage.getItem('tx-backlog-open') === '1')
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    window.localStorage.setItem('tx-backlog-open', next ? '1' : '0')
  }

  const max = Math.max(1, ...backlog.map((m) => m.booked + m.open))
  /*
    NAMING, and it is load-bearing. Both of these are EVENT-DATE rollups over
    the chart's rolling window, and neither is the "Booked this month" tile
    beside them — that one is won deals by CLOSED_AT month (wonValueInMonth,
    lib/pipeline-stats.ts:27). A won deal with no event date, or one dated
    outside the window, belongs to the tile and to neither of these, which is
    how the collapsed line came to read "$0 booked" next to "BOOKED THIS MONTH
    $22,000". So the summary below says "won on the calendar" and "from this
    month on" — it never says "booked", and it never says "ahead" either, which
    is the "Booked ahead · next 90 days" tile's word for a THIRD window.
  */
  const wonOnCalendar = backlog.reduce((s, m) => s + m.booked, 0)
  const datedFromThisMonth = backlog
    .filter((m) => m.ym >= todayYm)
    .reduce((s, m) => s + m.booked + m.open, 0)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        {/*
          `aria-expanded` is the whole state of this control for a screen reader:
          open/closed reached sighted users through the rotated caret and reached
          assistive tech not at all. The caret is `aria-hidden` so the button's
          accessible name comes from its own visible text — which is why the
          `aria-label` that used to duplicate it is gone.
        */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
          style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
        >
          <span
            aria-hidden
            className="inline-block transition-transform"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            ▾
          </span>
          Revenue by month
        </button>
        <p className="text-xs text-muted-foreground">
          {open
            ? 'rolling 12 months · solid won · light open'
            : `${money(wonOnCalendar)} won on the calendar · ${money(datedFromThisMonth)} from this month on`}
        </p>
      </div>
      {open && (
        <div className="overflow-x-auto">
          <div className="flex min-w-[560px] items-end gap-1" style={{ height: 56 }}>
            {backlog.map((m) => {
              const empty = m.booked + m.open === 0
              return (
                <div key={m.ym} className="flex h-full flex-1 flex-col justify-end">
                  {empty ? (
                    <div className="w-full" style={{ height: 2, background: 'var(--border)' }} />
                  ) : (
                    <>
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${(m.open / max) * 100}%`,
                          background: 'color-mix(in oklab, var(--primary) 22%, transparent)',
                        }}
                        title={`${m.label} open ${money(m.open)}`}
                      />
                      <div
                        className="w-full"
                        style={{ height: `${(m.booked / max) * 100}%`, background: 'var(--primary)' }}
                        title={`${m.label} won ${money(m.booked)}`}
                      />
                    </>
                  )}
                  <p
                    className={`mt-1 text-center text-[10px]${
                      m.ym === todayYm ? ' font-semibold text-foreground' : ' text-muted-foreground'
                    }`}
                  >
                    {m.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function PipelineStatsHeader({ stats }: { stats: PipelineHeaderStats }) {
  const { bookedThisMonth, bookedLastYearSameMonth, bookedNext90, openPipeline, needsActionCount, backlog, todayYm } =
    stats
  const yoy = yoyLine(bookedThisMonth.value, bookedLastYearSameMonth.value)

  const needsAction = needsActionCount > 0

  // The outer split (figures | 12-month backlog) has no kit equivalent — KpiBand
  // is the figure row only, so it lives inside the left column here.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-6 border-y border-border py-4 max-[1180px]:grid-cols-1">
      {/*
        THE BAND MUST MEASURE ITS COLUMN, NOT THE WINDOW. `KpiBand`'s only
        collapse is `max-[1000px]:grid-cols-2`, a VIEWPORT query — and this band
        never gets the viewport. It gets the left track of the split above, which
        stays two-up until 1180px and gives up 420px to the chart plus a 24px
        gap. At a 1280px viewport with the default expanded sidebar (md:w-56 =
        224px) that is ~564px for four tiles: ~133px each, ~109px inside the
        tile's `p-3`. "BOOKED AHEAD · NEXT 90 DAYS" wraps to three lines and a
        seven-figure sum overflows — `grid-cols-4` is `minmax(0,1fr)`, so the
        track does not grow and the text spills over the neighbouring tile's
        border. The viewport query never fires, because the viewport is wide.
        A CONTAINER query measures the thing that is actually narrow. 700px is
        four tiles at ~160px minus the three 10px gaps — the width at which the
        longest label still fits on two lines.
        KIT FOLLOW-UP (not fixable here — components/ui is frozen to this
        branch): give `KpiBand` a `@container` of its own and swap
        `max-[1000px]:grid-cols-2` for `@max-[700px]:grid-cols-2`, so every
        consumer that puts the band in a column — this one, the opportunity
        spine, LeadVendorsClient's 3-up — stops needing a call-site override.
      */}
      <div className="@container/kpis min-w-0">
        <KpiBand className="@max-[700px]/kpis:grid-cols-2">
          <PipelineStatTile
            label="Booked this month"
            value={money(bookedThisMonth.value)}
            tone="money"
            note={yoy ? yoy.text : `${bookedThisMonth.count} won`}
            noteTone={yoy?.destructive ? 'alert' : 'default'}
          />
          <PipelineStatTile
            label="Booked ahead · next 90 days"
            value={money(bookedNext90.value)}
            tone="money"
            note={`${bookedNext90.count} event${bookedNext90.count === 1 ? '' : 's'} on the calendar`}
          />
          <PipelineStatTile
            label="Open pipeline"
            value={money(openPipeline.value)}
            tone="money"
            note={`${openPipeline.count} opportunit${openPipeline.count === 1 ? 'y' : 'ies'}`}
          />
          {/*
            "Needs attention", not "Needs action". This is literally
            `groups.needs_attention.length` (leads/page.tsx:60) and the SAME number
            reaches the operator twice more within ~80px: the list's first tab and
            its group rule. Three names for one quantity read as three queues, so
            all three now use the health model's own word (`OppHealth =
            'needs_attention'`).
          */}
          <PipelineStatTile
            label="Needs attention"
            value={String(needsActionCount)}
            tone={needsAction ? 'alert' : 'default'}
            note={needsAction ? 'stale or unopened' : 'all caught up'}
            noteTone={needsAction ? 'alert' : 'default'}
          />
        </KpiBand>
      </div>
      <Backlog backlog={backlog} todayYm={todayYm} />
    </div>
  )
}
