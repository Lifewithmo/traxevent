import Link from 'next/link'
import type { Event, EventSeries } from '@/lib/types'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function MarketDayOverview({
  orgSlug, event, series,
}: {
  orgSlug: string
  event: Event
  series: EventSeries | null
}) {
  return (
    <div className="p-5 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
          <p className="mt-1 font-medium">{event.location?.name ?? 'Not set'}</p>
          {event.location?.address && <p className="text-sm text-muted-foreground">{event.location.address}</p>}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Hours</p>
          <p className="mt-1 font-medium">
            {event.hours ? `${event.hours.start}–${event.hours.end}` : 'Not set'}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Booth fee</p>
          <p className="mt-1 font-medium">{event.booth_fee != null ? money(event.booth_fee) : 'None'}</p>
        </div>
        {series && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
            <Link href={`/${orgSlug}/series/${series.id}`} className="mt-1 inline-block font-medium underline">
              {series.name}
            </Link>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        The sales register for market days arrives with the next increment — for now, adjust
        details in Settings, and find this day on the calendar and Today.
      </p>
    </div>
  )
}
