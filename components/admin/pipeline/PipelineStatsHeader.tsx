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
  const totalBooked = backlog.reduce((s, m) => s + m.booked, 0)
  const ahead = backlog
    .filter((m) => m.ym >= todayYm)
    .reduce((s, m) => s + m.booked + m.open, 0)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label="Revenue by month"
          className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
          style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
        >
          <span
            className="inline-block transition-transform"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            ▾
          </span>
          Revenue by month
        </button>
        <p className="text-xs text-muted-foreground">
          {open ? 'rolling 12 months · solid booked · light open' : `${money(totalBooked)} booked · ${money(ahead)} ahead`}
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
                        title={`${m.label} booked ${money(m.booked)}`}
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
      <KpiBand>
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
        <PipelineStatTile
          label="Needs action"
          value={String(needsActionCount)}
          tone={needsAction ? 'alert' : 'default'}
          note={needsAction ? 'stale or unopened' : 'all caught up'}
          noteTone={needsAction ? 'alert' : 'default'}
        />
      </KpiBand>
      <Backlog backlog={backlog} todayYm={todayYm} />
    </div>
  )
}
