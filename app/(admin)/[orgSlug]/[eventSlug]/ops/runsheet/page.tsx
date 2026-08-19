export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { listItinerary } from '@/actions/itinerary'
import { groupItineraryByDay } from '@/lib/itinerary'
import { formatEventDateRange, parseDay } from '@/lib/event-ui'
import { resolveAnchorTime, RUN_SHEET_CHECKLIST_PHASES } from './anchor'
import { RunSheetClient } from '@/components/admin/ops/RunSheetClient'

/**
 * Server assembly for the day-of run sheet. Every read happens HERE and is
 * passed down inlined: the client component holds the whole sheet in props, so
 * a tab opened on wifi at 6am still answers "where, when, who, what's left"
 * from a field with no signal. (Offline mutation queueing is NOT claimed —
 * check-offs still need a connection and fail visibly without one.)
 */
export default async function RunSheetPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const [plan, itineraryItems] = await Promise.all([
    getOpsPlan(orgId, eventId),
    listItinerary(orgId, eventId),
  ])

  const itinerary = groupItineraryByDay(itineraryItems)
  const anchor = resolveAnchorTime({
    serviceStart: plan?.requirements.service_start,
    hoursStart: event.hours?.start,
    itinerary,
  })

  // Single-day jobs (the norm) get the weekday — "Sat, Aug 29" is how a
  // call sheet names a day; ranges fall back to the shared range formatter.
  const startDay = parseDay(event.event_start)
  const singleDay = !event.event_end || event.event_end === event.event_start
  const dateLabel = singleDay && startDay
    ? startDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : formatEventDateRange(event.event_start, event.event_end)

  // Day-of phases only: prep/load-out live on the ops plan and load-out
  // surface; the run sheet carries what happens on site.
  const checklists = plan
    ? plan.checklists
        .filter((c) => (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).includes(c.phase))
        .sort(
          (a, b) =>
            (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).indexOf(a.phase) -
            (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).indexOf(b.phase)
        )
    : []

  const loadoutItems = plan ? [...plan.shopping_list, ...plan.packing_list] : []

  return (
    <RunSheetClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      eventName={event.name}
      dateLabel={dateLabel}
      anchor={anchor}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      venue={event.location ?? null}
      contacts={event.key_contacts ?? []}
      hasPlan={plan !== null}
      siteNeeds={plan?.requirements.site_needs ?? []}
      itinerary={itinerary}
      checklists={checklists}
      loadout={
        plan
          ? { checked: loadoutItems.filter((i) => i.checked).length, total: loadoutItems.length }
          : null
      }
    />
  )
}
