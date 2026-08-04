import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
import { resolveTerminology } from '@/lib/event-types'
import { EVENT_PAGES } from '@/lib/types'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { eventId, event, member } = await requireEvent(orgSlug, campSlug)
  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)
  const allowed = allowedEventPages(member, eventId, [...EVENT_PAGES], event.department_id ?? null)

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} terminology={terminology} allowedEventPages={allowed} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
