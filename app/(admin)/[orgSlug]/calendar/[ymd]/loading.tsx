import { CanvasSkeleton, SpineSkeleton, LoadingAnnouncement } from '../calendar-skeleton'

/**
 * Loading boundary for the day-detail route — canvas AND spine.
 *
 * The day route is the hot path: with the layout already rendered, opening a
 * day is the navigation where a fallback is the entire visible change. It gets
 * its own boundary (rather than inheriting the parent's canvas-only one) so the
 * skeleton matches THIS route's final layout — otherwise the 360px spine would
 * pop in after paint and shove the canvas sideways.
 */
export default function CalendarDayLoading() {
  return (
    <>
      <LoadingAnnouncement label="Loading day…" />
      <CanvasSkeleton />
      <SpineSkeleton />
    </>
  )
}
