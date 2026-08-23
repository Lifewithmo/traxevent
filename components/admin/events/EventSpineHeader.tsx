// Event identity header — the top of the shared event spine. Server-compatible
// (no hooks); identity only, no action buttons this pass.
//
// print:hidden sits on the <header> itself, never on a wrapper div: print
// routes compose through the event layout, and a wrapper would also break
// position:sticky inside the layout's overflow-auto <main>.
import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { EVENT_STATUS_TONE, EVENT_STATUS_LABEL, formatEventDateRange } from '@/lib/event-ui'
import { EVENT_KIND_LABELS, kindOf } from '@/lib/occasions/kind'
import type { Event } from '@/lib/types'

export function EventSpineHeader({ event }: { event: Event }) {
  const subtitle = [
    EVENT_KIND_LABELS[kindOf(event)],
    formatEventDateRange(event.event_start, event.event_end),
    event.location?.name,
  ]
    .filter(Boolean)
    .join(' · ')

  // Compact address with a Maps link — the header is where a phone thumb
  // reaches for "where am I driving" without opening the run sheet.
  const address = event.location?.address

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-3 backdrop-blur print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={event.name} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{event.name}</h1>
            <StatusPill tone={EVENT_STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</StatusPill>
          </div>
          {(subtitle || address) && (
            <p className="truncate text-sm text-muted-foreground">
              {subtitle}
              {address && (
                <>
                  {subtitle && ' · '}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {address}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
