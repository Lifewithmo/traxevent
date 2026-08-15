import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
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

  return (
    // Same shell rule as the org layout: below md the sidebar is a bar plus an
    // off-canvas drawer, so the shell stacks and `main` gets the full viewport.
    <div className="flex min-h-screen max-md:flex-col">
      <AdminSidebar
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        eventKind={kindOf(event)}
        terminology={terminology}
        allowedEventPages={allowed}
        enabledModules={enabledModules}
      />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
