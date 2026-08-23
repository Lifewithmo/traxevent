'use client'

import { createContext, useContext, useMemo } from 'react'
import { bindingConstraint, type BookabilityBinding, type BookabilityCtx, type BookabilityVerdict } from '@/lib/calendar-bookability'

/**
 * How the verdict reaches the grids.
 *
 * `CalendarCanvas` renders `MonthGrid` / `WeekGrid` and is off-limits on this
 * branch (it was just restructured for drag), so the verdict cannot be threaded
 * down as a prop without editing it. A context provider wrapped around the
 * canvas by the two calendar PAGES — which this increment does own — delivers
 * the same data without touching a line of the canvas, and has the better
 * property anyway: the grids opt in, and any grid rendered outside the cockpit
 * (tests, a future embed) simply gets `null` and renders no marks at all rather
 * than crashing on a missing prop.
 *
 * The value is plain JSON by construction (see `BookabilityRadar`), so it
 * crosses the server→client boundary without depending on Map/Set
 * serialisation.
 */
const BookabilityContext = createContext<BookabilityCtx | null>(null)

export function BookabilityProvider({
  ctx,
  children,
}: {
  ctx: BookabilityCtx | null
  children: React.ReactNode
}) {
  return <BookabilityContext.Provider value={ctx}>{children}</BookabilityContext.Provider>
}

/** The raw context, for surfaces that need the alternatives scan too. */
export function useBookabilityCtx(): BookabilityCtx | null {
  return useContext(BookabilityContext)
}

export interface DayVerdict {
  verdict: BookabilityVerdict
  binding: BookabilityBinding | null
}

/**
 * One day's verdict, or `null` when there is no context (outside the cockpit) —
 * `null` means "render nothing", never "open".
 *
 * PAST DAYS RETURN NULL. Every date behind today is technically `closed` (its
 * book-by passed long ago), and honouring that literally would paint an entire
 * archived month grey and stamp "can't be prepped in time" on last Tuesday.
 * Nobody asks whether they are free last Tuesday. The pure function stays
 * honest; the RENDERER is where the question's tense lives.
 */
export function useDayVerdict(ymd: string): DayVerdict | null {
  const ctx = useContext(BookabilityContext)
  return useMemo(() => {
    if (!ctx) return null
    const day = ymd.slice(0, 10)
    if (day < ctx.today) return null
    return bindingConstraint(day, ctx)
  }, [ctx, ymd])
}
