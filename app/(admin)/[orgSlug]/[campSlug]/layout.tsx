import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireCamp, allowedCampPages } from '@/lib/auth/guards'
import { resolveTerminology } from '@/lib/event-types'
import { CAMP_PAGES } from '@/lib/types'

export default async function CampLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { campId, camp, member } = await requireCamp(orgSlug, campSlug)
  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)
  const allowed = allowedCampPages(member, campId, [...CAMP_PAGES], camp.department_id ?? null)

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} terminology={terminology} allowedCampPages={allowed} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
