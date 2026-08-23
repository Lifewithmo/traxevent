import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { EventSpineHeader } from '@/components/admin/events/EventSpineHeader'
import { EventSubNav } from '@/components/admin/events/EventSubNav'
import { EventBandGate } from '@/components/admin/events/EventBandGate'
import { EventKpiBand } from '@/components/admin/events/EventKpiBand'
import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
import { buildEventNav } from '@/lib/event-nav'
import { getEventSpineKpis } from '@/lib/event-spine'
import { resolveTerminology } from '@/lib/event-types'
import { resolveEnabledModules } from '@/lib/industry-packs'
import { kindOf } from '@/lib/occasions/kind'
import { EVENT_PAGES } from '@/lib/types'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { org, eventId, event, member } = await requireEvent(orgSlug, eventSlug)
  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)
  const allowed = allowedEventPages(member, eventId, [...EVENT_PAGES], event.department_id ?? null)
  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  const kind = kindOf(event)

  const navItems = buildEventNav({ kind, terminology, allowedPages: allowed, enabledModules })

  // Computed server-side and passed down so countdown math is deterministic
  // and testable (same UTC day convention as lib/ops/readiness.ts). Passed to
  // the aggregator too, so its cache key matches the dashboard page's call.
  const today = new Date().toISOString().slice(0, 10)

  // Market days skip the band — their MARKET_DAY overview handles its own numbers.
  const rosterEnabled = enabledModules.includes('attendee-roster')
  const kpis =
    kind === 'client_job'
      ? await getEventSpineKpis({
          orgId: org.id,
          eventId,
          event,
          // A roster-less org has no families data at all: reading the empty
          // collection would render "0 registrations" where the band's
          // "Guests expected" fallback belongs, so gate families out here.
          // 'reports' also unlocks the families read in the aggregator, so it
          // must be stripped alongside 'families' or the gate is defeated.
          allowedPages: rosterEnabled ? allowed : allowed.filter((p) => p !== 'families' && p !== 'reports'),
          // B4: money (families-financial AND lead-AR) is owner/admin only —
          // a role gate from the already-loaded member doc, deliberately
          // independent of the roster-less allowedPages strip above.
          includeMoney: member.role === 'owner' || member.role === 'admin',
          today,
          // Band-only call: the band renders none of the brief facts, so skip
          // the closeout + itinerary reads and the blocker math. On the
          // dashboard leaf the page's own full call shares the core reads via
          // React cache(), so the fan-out runs once per request either way.
          wantBriefFacts: false,
        })
      : null

  return (
    // Same shell rule as the org layout: below md the sidebar is a bar plus an
    // off-canvas drawer, so the shell stacks and `main` gets the full viewport.
    <div className="flex min-h-screen max-md:flex-col">
      <AdminSidebar
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        eventKind={kind}
        terminology={terminology}
        allowedEventPages={allowed}
        enabledModules={enabledModules}
      />
      {/* bg-background, not a raw literal — same fix as the org layout: the hardcoded ground was
          what made dark mode unreadable on every event page. --background is warm-50 in light, so
          the ground/card relationship is unchanged. */}
      <main className="flex-1 bg-background overflow-auto">
        <EventSpineHeader event={event} />
        <EventSubNav orgSlug={orgSlug} eventSlug={eventSlug} items={navItems} />
        {/* B1: the band is leaf-gated — suppressed on 'dashboard' (the brief
            replaces it) and 'checkin' (fold budget) via the client wrapper. */}
        {kpis && (
          <EventBandGate>
            <div className="px-5 pt-4 print:hidden">
              <EventKpiBand event={event} kpis={kpis} today={today} />
            </div>
          </EventBandGate>
        )}
        {children}
      </main>
    </div>
  )
}
