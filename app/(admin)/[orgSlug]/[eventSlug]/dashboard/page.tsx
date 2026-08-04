import { requireEvent } from '@/lib/auth/guards'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  await requireEvent(orgSlug, eventSlug)
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 text-sm">
        {orgSlug} / {eventSlug}
      </p>
      <div className="mt-8 p-6 bg-white rounded-lg border text-center text-gray-400">
        Camp feature pages (families, assignments, teams, budget, itinerary, communicate)
        are coming in Phase 1b.
      </div>
    </div>
  )
}
