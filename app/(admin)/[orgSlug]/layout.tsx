import { headers } from 'next/headers'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules, getIndustryPack, catalogLabel } from '@/lib/industry-packs'
import { isJobRoute, PATHNAME_HEADER } from '@/lib/sidebar-nav'
import { listSidebarEvents } from '@/actions/sidebar-events'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Gate the entire admin surface: must be a logged-in member of this org.
  // redirect('/login') if unauthenticated; notFound() if not a member of this org.
  const { org, orgId } = await requireOrgMember(orgSlug)
  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  // Inside a job the Events section shows that job's nav, never the today+4
  // list — so scanning the org's events there is a full read for nothing.
  // An absent header means "unknown", which falls back to fetching.
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? ''
  const onJobRoute = isJobRoute(pathname, orgSlug)
  const upcomingEvents =
    enabledModules.includes('events') && !onJobRoute ? await listSidebarEvents(orgId) : []
  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        orgSlug={orgSlug}
        enabledModules={enabledModules}
        catalogLabel={catalogLabel(getIndustryPack(org.industry_pack_id))}
        upcomingEvents={upcomingEvents}
      />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
