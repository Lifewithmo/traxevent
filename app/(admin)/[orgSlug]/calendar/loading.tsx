import { CanvasSkeleton, LoadingAnnouncement } from './calendar-skeleton'

/**
 * Loading boundary for the calendar canvas.
 *
 * Beyond showing a fallback, this is what makes <Link> prefetching mean
 * anything here: Next prefetches a route only as far as its nearest loading
 * boundary, and the cockpit had none — so every nav into a `force-dynamic`
 * route over unbounded Firestore reads was a cold round-trip that left the UI
 * pixel-identical to idle between mousedown and paint.
 *
 * Renders into the layout's children slot, so the real left rail is already
 * beside it (loading.tsx does not wrap the layout in its own segment). The
 * `/calendar` route has no day spine, so neither does this — the spine
 * placeholder lives in [ymd]/loading.tsx, which is the route that has one.
 */
export default function CalendarLoading() {
  return (
    <>
      <LoadingAnnouncement label="Loading calendar…" />
      <CanvasSkeleton />
    </>
  )
}
