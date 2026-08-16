import type { Event, EventKind } from '@/lib/types'

/** The ONLY way to read an event's kind — absent means client_job (zero migration). */
export function kindOf(e: Pick<Event, 'kind'>): EventKind {
  return e.kind ?? 'client_job'
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  client_job: 'Client job',
  market_day: 'Market day',
}
