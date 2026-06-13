import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { listItinerary } from '@/actions/itinerary'
import { groupItineraryByDay, formatTime } from '@/lib/itinerary'
import { notFound } from 'next/navigation'

function formatDayHeading(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default async function RegistrantItineraryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  if (!org) notFound()
  const camp = await getCampBySlug(org.id, campSlug)
  if (!camp) notFound()

  if (!camp.itinerary_published) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
        <p className="text-sm text-gray-500">The schedule for this event hasn&apos;t been published yet. Check back soon.</p>
      </div>
    )
  }

  const items = await listItinerary(org.id, camp.id)
  const days = groupItineraryByDay(items)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[#7C3AED] font-semibold">{org.name}</p>
        <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name} — Schedule</h1>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-gray-500">No schedule items posted yet.</p>
      ) : (
        days.map(({ day, items: dayItems }) => (
          <div key={day} className="bg-white rounded-xl border border-[#DDD6FE] p-5">
            <h2 className="font-semibold text-[#4C1D95] mb-3">{formatDayHeading(day)}</h2>
            <ul className="space-y-3">
              {dayItems.map((it) => (
                <li key={it.id} className="flex gap-3">
                  <span className="text-sm font-medium text-[#7C3AED] whitespace-nowrap w-28 flex-shrink-0">
                    {formatTime(it.start_time)}{it.end_time ? `–${formatTime(it.end_time)}` : ''}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{it.title}</p>
                    {(it.location || it.description) && (
                      <p className="text-xs text-gray-500">
                        {[it.location, it.description].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
