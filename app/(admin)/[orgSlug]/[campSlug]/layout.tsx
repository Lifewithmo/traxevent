import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { getEventType } from '@/lib/event-types'

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
  const eventType = getEventType(camp?.event_type_id ?? 'summer-camp')

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} terminology={eventType.terminology} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
