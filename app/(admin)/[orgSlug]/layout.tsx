import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules } from '@/lib/industry-packs'

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
  const { org } = await requireOrgMember(orgSlug)
  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} enabledModules={enabledModules} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
