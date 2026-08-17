import type { CalendarItem } from '@/lib/calendar'
import type { Event } from '@/lib/types'
import { todayYmd as localDateOf } from '@/lib/opportunity-detail'

// Cash-flow runway to your next booked job. Pure derivation over an already-built
// feed + the org's events. Receivables timing only — this is NEVER a P&L: it says
// what is OWED to you and whether it lands before each upcoming job, not profit or
// cost. No fetching, no React, no server imports.

export interface RunwayJob {
  eventId: string
  title: string
  /** the job's date (YYYY-MM-DD) — event_start, the live source of truth. */
  date: string
  /** outstanding receivables anchored here whose due date is on or before the job. */
  inflowBefore: number
  /** the remainder anchored here, due after the job. */
  dueAfter: number
}

const ymd = (s: string) => s.slice(0, 10)

/**
 * Ordered upcoming booked jobs (future/today `event_start`, ascending), each with
 * the receivables expected before it vs. after it.
 *
 * Anchor rule (verified, no migration): each `invoice_due` item joins to an Event
 * through `Invoice.lead_id → Event` — NOT `Lead.event_date`, which goes stale on
 * reschedule. `Event.lead_id` is not 1:1, so when a lead owns several events its
 * receivables attach to the NEAREST FUTURE `event_start`.
 */
export function buildRunway(items: CalendarItem[], events: Event[], today: Date): RunwayJob[] {
  // "today" is the LOCAL calendar date (the same convention as todayYmd() used
  // everywhere else on the page), NOT the UTC date. Deriving it via
  // today.toISOString() drops tonight's jobs and mis-buckets receivables for
  // several hours each evening in any negative-UTC-offset (Americas) org.
  const todayYmd = localDateOf(today)
  const live = events.filter((e) => e.status !== 'archived' && e.event_start)

  // Upcoming booked jobs, nearest first.
  const upcoming = live
    .filter((e) => ymd(e.event_start) >= todayYmd)
    .sort((a, b) => a.event_start.localeCompare(b.event_start))

  // Each lead's receivables anchor to its nearest-future event.
  const nearestByLead = new Map<string, Event>()
  for (const e of live) {
    if (!e.lead_id || ymd(e.event_start) < todayYmd) continue
    const cur = nearestByLead.get(e.lead_id)
    if (!cur || e.event_start.localeCompare(cur.event_start) < 0) nearestByLead.set(e.lead_id, e)
  }

  // Bucket outstanding receivables onto their anchor event, split before/after.
  const byEvent = new Map<string, { before: number; after: number }>()
  for (const it of items) {
    if (it.kind !== 'invoice_due' || !it.leadId || it.amount == null) continue
    const anchor = nearestByLead.get(it.leadId)
    if (!anchor) continue
    const bucket = byEvent.get(anchor.id) ?? { before: 0, after: 0 }
    if (ymd(it.date) <= ymd(anchor.event_start)) bucket.before += it.amount
    else bucket.after += it.amount
    byEvent.set(anchor.id, bucket)
  }

  return upcoming.map((e) => {
    const b = byEvent.get(e.id) ?? { before: 0, after: 0 }
    return { eventId: e.id, title: e.name, date: ymd(e.event_start), inflowBefore: b.before, dueAfter: b.after }
  })
}
