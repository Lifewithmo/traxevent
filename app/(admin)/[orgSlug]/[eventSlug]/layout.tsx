import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
import { resolveTerminology } from '@/lib/event-types'
import { EVENT_PAGES } from '@/lib/types'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { eventId, event, member } = await requireEvent(orgSlug, eventSlug)
  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)
  const allowed = allowedEventPages(member, eventId, [...EVENT_PAGES], event.department_id ?? null)

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} eventSlug={eventSlug} terminology={terminology} allowedEventPages={allowed} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
