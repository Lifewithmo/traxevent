import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading placeholders for the calendar cockpit, shaped like the real thing.
 *
 * IMPORTANT — there is deliberately NO left-rail skeleton here. `loading.tsx`
 * does not wrap the `layout.tsx` in its own segment, so the layout (and with it
 * the REAL <CalendarLeftRail/>) has already rendered by the time any of this is
 * on screen. Drawing a rail placeholder would paint a second rail beside the
 * live one. These fill only the layout's children slot:
 *   <div className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
 *
 * Widths/breakpoints below are copied from the components they stand in for —
 * CalendarCanvas (toolbar + pane), WeekGrid (the 3rem gutter + 7 columns) and
 * the day-spine wrapper in [ymd]/page.tsx (lg:w-[360px]).
 */

/** Same grid template as WeekGrid — an hours gutter plus seven day columns. */
const GRID = 'grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const HOURS = [0, 1, 2, 3, 4, 5, 6, 7]

/** Mirrors <CalendarCanvas/>: toolbar over a scrolling week grid. */
export function CanvasSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Toolbar: ⌘K jump, range label, prev/today/next, view tabs. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Skeleton className="h-7 w-20 rounded-lg" />
        <Skeleton className="h-4 w-40" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Skeleton className="h-7 w-9 rounded-lg" />
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-7 w-9 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-56 rounded-lg max-sm:w-40" />
        </div>
      </div>

      {/* View pane — week grid, the default view. */}
      <div className="min-w-0 flex-1 overflow-hidden">
        {/* Day header row */}
        <div className={`${GRID} border-b border-border`}>
          <div aria-hidden />
          {DAYS.map((d) => (
            <div key={d} className="border-l border-border/60 px-2 py-1.5">
              <Skeleton className="mx-auto h-3 w-10" />
            </div>
          ))}
        </div>

        {/* All-day band */}
        <div className={`${GRID} items-stretch border-b border-border`}>
          <div className="flex items-start justify-end p-1.5">
            <Skeleton className="h-2.5 w-9" />
          </div>
          {DAYS.map((d) => (
            <div key={d} className="border-l border-border/60 p-1">
              {d % 3 === 1 ? <Skeleton className="h-4 w-full" /> : null}
            </div>
          ))}
        </div>

        {/* Time-grid body: hours gutter + seven day bodies */}
        <div className={GRID}>
          <div className="flex flex-col">
            {HOURS.map((h) => (
              <div key={h} className="flex h-12 items-start justify-end pr-1.5 pt-1">
                <Skeleton className="h-2.5 w-7" />
              </div>
            ))}
          </div>
          {DAYS.map((d) => (
            <div key={d} className="flex flex-col border-l border-border/60">
              {HOURS.map((h) => (
                <div key={h} className="h-12 border-b border-border/40 p-1">
                  {(d + h) % 5 === 0 ? <Skeleton className="h-full w-full rounded-md" /> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Mirrors the day spine's wrapper + <DaySpine/> card stack. The wrapper classes
 * match [ymd]/page.tsx exactly: full width stacked under the canvas below lg,
 * a 360px right column at lg+.
 */
export function SpineSkeleton() {
  return (
    <div className="w-full shrink-0 border-t border-border lg:w-[360px] lg:border-l lg:border-t-0">
      <div className="space-y-3 p-3">
        <Skeleton className="h-4 w-32" />
        {[0, 1].map((c) => (
          <div key={c} className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-xs">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Screen-reader announcement; the skeletons themselves are aria-hidden. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  )
}
