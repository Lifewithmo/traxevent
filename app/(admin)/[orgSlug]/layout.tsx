import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules, getIndustryPack, catalogLabel, storefrontLabel } from '@/lib/industry-packs'
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
        storefrontLabel={storefrontLabel(getIndustryPack(org.industry_pack_id))}
        upcomingEvents={upcomingEvents}
      />
      {/* bg-background, not a raw literal: --background is warm-50 in light (the same warm
          off-white bg-gray-50 gave us, with --card/warm-0 still sitting above it) and flips in
          dark. The hardcoded literal was the single blocker that made dark mode unreadable across
          every admin page — measured at 49 WCAG AA text failures over the four Pipeline surfaces
          alone (money figures at 2.0, group headers and task titles at 1.02), all of which drop to
          zero with this one token. */}
      <main className="flex-1 bg-background overflow-auto">{children}</main>
    </div>
  )
}
