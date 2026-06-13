import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { resolveTerminology, getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'

export default async function CampLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  const camp = org ? await getCampBySlug(org.id, campSlug) : null
  const terminology = camp
    ? resolveTerminology(camp.event_type_id, camp.event_type_terminology)
    : getEventType(DEFAULT_EVENT_TYPE_ID).terminology

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} terminology={terminology} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
