import { Card, CardContent } from '@/components/ui/card'
import type { BacklogMonth } from '@/lib/pipeline-stats'

export interface PipelineHeaderStats {
  bookedThisMonth: { count: number; value: number }
  bookedLastYearSameMonth: { count: number; value: number }
  bookedNext90: { count: number; value: number }
  needsActionCount: number
  backlog: BacklogMonth[]
}

const money = (n: number) => `$${n.toLocaleString()}`

// Year-over-year is only meaningful once last year's month has data;
// fall back to the plain won-count line until then.
function yoyLine(now: number, lastYear: number): string | null {
  if (lastYear <= 0) return null
  const pct = Math.round(((now - lastYear) / lastYear) * 100)
  if (pct === 0) return 'even with this month last year'
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs this month last year`
}

export function PipelineStatsHeader({ stats }: { stats: PipelineHeaderStats }) {
  const { bookedThisMonth, bookedLastYearSameMonth, bookedNext90, needsActionCount, backlog } = stats
  const yoy = yoyLine(bookedThisMonth.value, bookedLastYearSameMonth.value)
  const max = Math.max(1, ...backlog.map((m) => m.booked + m.open))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Booked this month</p>
            <p className="text-2xl font-semibold">{money(bookedThisMonth.value)}</p>
            <p className="text-xs text-muted-foreground">
              {yoy ?? `${bookedThisMonth.count} won`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Booked ahead · next 90 days</p>
            <p className="text-2xl font-semibold">{money(bookedNext90.value)}</p>
            <p className="text-xs text-muted-foreground">
              {`${bookedNext90.count} event${bookedNext90.count === 1 ? '' : 's'} on the calendar`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Needs action</p>
            <p className={`text-2xl font-semibold${needsActionCount > 0 ? ' text-destructive' : ''}`}>
              {needsActionCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {needsActionCount > 0 ? 'stale or unopened — see below' : 'all caught up'}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Booked revenue by month</p>
            <p className="text-xs text-muted-foreground">solid = booked · light = open pipeline with dates</p>
          </div>
          <div className="flex h-28 items-end gap-3">
            {backlog.map((m) => (
              <div key={m.ym} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className="rounded-t-sm bg-primary/25"
                  style={{ height: `${(m.open / max) * 100}%` }}
                  title={`${m.label} open ${money(m.open)}`}
                />
                <div
                  className="bg-primary"
                  style={{ height: `${(m.booked / max) * 100}%` }}
                  title={`${m.label} booked ${money(m.booked)}`}
                />
                <p className="mt-1 text-center text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
