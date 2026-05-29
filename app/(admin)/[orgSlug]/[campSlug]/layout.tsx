import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default async function CampLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
