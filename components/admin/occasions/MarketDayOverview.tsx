import Link from 'next/link'
import type { Event, EventSeries } from '@/lib/types'

/** Whole dollars stay whole ("$45"); cents only when they exist. */
function money(n: number): string {
  const abs = Math.abs(n)
  const rounded = Math.round(abs * 100) / 100
  const s = Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`
  return n < 0 ? `−${s}` : s
}

export function MarketDayOverview({
  orgSlug, event, series, today, isAdmin, closeoutNet,
}: {
  orgSlug: string
  event: Event
  series: EventSeries | null
  /** Server-computed YYYY-MM-DD (deterministic, same convention as the brief). */
  today: string
  /** Money is owner/admin only (B4 precedent) — non-admins keep the plain booth-fee tile. */
  isAdmin: boolean
  /** Net for the day when saved sales exist (any saved sales counts — Mark-complete
   *  optional), computed through marketDayCloseoutSummary; null = not closed out. */
  closeoutNet: number | null
}) {
  const fee = event.booth_fee ?? 0
  const dayArrived = today >= event.event_start.slice(0, 10)

  // The money tile has exactly three designed states (spec 2026-08-23 S1.4):
  // pre-date quiet · day-of CTA (the tile IS the primary action) · closed-out
  // net. It REPLACES the old booth-fee tile for admins — the fee lives inside
  // each state's line, so the value never renders twice on this screen.
  let moneyTile: React.ReactNode
  if (!isAdmin) {
    moneyTile = (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Booth fee</p>
        <p className="mt-1 font-medium">{event.booth_fee != null ? money(event.booth_fee) : 'None'}</p>
      </div>
    )
  } else if (closeoutNet !== null) {
    moneyTile = (
      <div className="rounded-lg border bg-card p-4 sm:col-span-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Money</p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${closeoutNet < 0 ? 'text-destructive' : 'text-[var(--money-green)]'}`}>
          Net {money(closeoutNet)}
        </p>
        <p className="text-sm text-muted-foreground">
          {fee > 0 ? `after the ${money(fee)} booth fee` : 'no booth fee'} ·{' '}
          <Link href={`/${orgSlug}/${event.slug}/closeout`} className="underline">view</Link>
        </p>
      </div>
    )
  } else if (dayArrived) {
    moneyTile = (
      <Link
        href={`/${orgSlug}/${event.slug}/closeout`}
        className="flex min-h-11 flex-col justify-center rounded-lg border bg-card p-4 hover:bg-muted/50 sm:col-span-2"
      >
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Money</p>
        <p className="mt-1 text-lg font-semibold text-[var(--money-green)]">Close out the day →</p>
        <p className="text-sm text-muted-foreground">
          {fee > 0 ? `sales − ${money(fee)} booth fee = net` : 'record today’s sales'}
        </p>
      </Link>
    )
  } else {
    moneyTile = (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Money</p>
        <p className="mt-1 font-medium">{fee > 0 ? `${money(fee)} booth fee` : 'No booth fee'}</p>
        <p className="text-sm text-muted-foreground">Closeout opens on the day.</p>
      </div>
    )
  }

  // Day-of, the money tile is the job — it leads. Before the day, logistics lead.
  const moneyLeads = isAdmin && dayArrived

  return (
    <div className="p-5 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        {moneyLeads && moneyTile}
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
        {!moneyLeads && moneyTile}
        {series && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
            <Link href={`/${orgSlug}/series/${series.id}`} className="mt-1 inline-block font-medium underline">
              {series.name}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
