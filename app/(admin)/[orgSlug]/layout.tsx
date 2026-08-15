import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules, getIndustryPack, catalogLabel } from '@/lib/industry-packs'
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
  const upcomingEvents = enabledModules.includes('events') ? await listSidebarEvents(orgId) : []
  return (
    // Below md the sidebar renders as a slim bar plus an off-canvas drawer, so the
    // shell stacks and `main` gets the full viewport width instead of ~63px.
    <div className="flex min-h-screen max-md:flex-col">
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
