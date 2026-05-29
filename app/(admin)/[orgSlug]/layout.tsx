import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
