import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading placeholders for the calendar cockpit, shaped like the real thing.
 *
 * IMPORTANT — <CanvasSkeleton/> and <SpineSkeleton/> are for `loading.tsx`,
 * which does NOT wrap `layout.tsx` in its own segment; they fill only the
 * layout's children slot:
 *   <div className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
 * Neither of them draws a rail — the layout owns that, and a rail placeholder
 * here would paint a second rail beside the live one.
 *
 * <RailSkeleton/> is the exception, and it is used ONLY by the layout's own
 * <Suspense> boundary around the rail's Firestore reads. `loading.tsx` cannot
 * cover those (a loading file wraps a layout's CHILDREN, never the layout
 * itself), so before that boundary existed a cold entry to /calendar blocked on
 * the feed + events + ICS-token reads with the whole cockpit blank.
 *
 * Widths/breakpoints below are copied from the components they stand in for —
 * CalendarCanvas (toolbar + pane), WeekGrid (the 3rem gutter + 7 columns),
 * CalendarLeftRail (the 280px column + its mobile bar) and the day-spine
 * wrapper in [ymd]/page.tsx (lg:w-[360px]).
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

/**
 * Mirrors <CalendarLeftRail/> after its composition pass: the mobile bar below
 * md, then the 280px column in its FIVE zones —
 *
 *   1. which day   — filter tabs + mini-month + next-open, one box
 *   2. needs a date — the focal card: the rail's only bordered container, and
 *      the only placeholder here that draws a border and a big number
 *   3. this week   — one collapsed summary line, not five tiles
 *   4. cash runway — hairline-divided rows, not bordered cards
 *   5. key & setup — the two mark legends + the ICS link, in the footer
 *
 * The zone heights and the focal card's weight are the point: a skeleton that
 * paints five equal grey slabs would promise the shape the rail no longer has,
 * and the layout would jump when the real rail arrives.
 */
export function RailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div
        className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden bg-sidebar max-md:hidden md:border-r md:border-sidebar-border"
        data-slot="rail-skeleton"
      >
        {/* 1 · which day: filter tabs, month header, the 7-wide grid, next-open. */}
        <div className="space-y-2 border-b border-sidebar-border px-4 py-3">
          <Skeleton className="h-7 w-full rounded-lg" />
          <Skeleton className="h-3.5 w-28" />
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-6 rounded-md" />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-9 rounded-md" />
            <Skeleton className="h-5 w-9 rounded-md" />
          </div>
        </div>
        {/* 2 · the focal card: heading, the 26px count, its summary, four rows. */}
        <div className="mx-3 my-3 space-y-1.5 rounded-lg border border-sidebar-border bg-card px-2.5 py-2 shadow-xs">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-36" />
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} className="h-9 w-full rounded-md" />
          ))}
        </div>
        {/* 3 · this week: eyebrow + one summary line, collapsed. */}
        <div className="space-y-1.5 border-b border-sidebar-border px-5 py-2.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-3 w-full" />
        </div>
        {/* 4 · cash runway: eyebrow + verdict, then hairline rows. */}
        <div className="space-y-1.5 px-4 py-3">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-3 w-40" />
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} className="h-9 w-full" />
          ))}
        </div>
        {/* 5 · key & setup. */}
        <div className="mt-auto space-y-1.5 border-t border-sidebar-border px-4 py-3">
          <Skeleton className="h-2.5 w-8" />
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <Skeleton key={k} className="h-3 w-full" />
            ))}
          </div>
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    </>
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
