'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { orgIdBySlug } from '@/lib/calendar-fetch'
import { logActivity } from '@/lib/activity'
import { addDays } from '@/lib/opportunity-detail'
import type { Event } from '@/lib/types'

// NOTE: this is a 'use server' module — every VALUE export must be an async
// function, so the batch cap below is deliberately module-private. Its twin
// lives in AgendaView (MAX_BULK_MOVE); keep the two in step.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const BULK_LIMIT = 200

/**
 * The only two calendar kinds whose date IS the job's date, and therefore the
 * only two a bulk "move to…" may write:
 *
 *   • event — a booked job (Event.event_start/_end, plus its opportunity)
 *   • lead  — a tentative hold (Lead.event_date)
 *
 * Everything else on the feed carries a date the operator does not own at that
 * row: an `invoice_due` date belongs to the invoice's payment terms, a
 * `compliance` date is an expiry set by the issuing authority (moving it is a
 * lie, not a reschedule), a `drop` date belongs to a pickup WINDOW edited on
 * the drop, and `task`/`follow_up` dates are sub-records with their own snooze
 * affordance. The agenda excludes them from selection rather than offering a
 * control that cannot honestly fire.
 */
export interface AgendaMove {
  kind: 'event' | 'lead'
  /** Event id for 'event', Lead id for 'lead' — the CalendarItem's own `id`. */
  id: string
  /** Target day, YYYY-MM-DD. Per-item (not one date for the batch) so UNDO is
   *  the same call with each row's original date. */
  date: string
  /**
   * OPTIONAL new working window, 'HH:mm' — only meaningful for kind 'event'.
   *
   * Added by W3-J (drag-to-retime and edge-drag-to-resize on the time grid).
   * It writes `Event.hours`, which is where the calendar feed actually reads a
   * job's time of day from (`buildCalendarFeed`: `e.hours ? { start, end }`) —
   * `event_start`/`event_end` are date-anchored and every writer in the repo
   * puts a bare YYYY-MM-DD in them. `shiftEventWindow` still carries any time
   * suffix those fields happen to hold, so the two can never contradict.
   *
   * Absent = the window is untouched, which is what every DAY move wants.
   */
  hours?: { start: string; end: string }
}

export interface AgendaMoveFailure {
  kind: AgendaMove['kind']
  id: string
  message: string
}

export interface BulkRescheduleResult {
  moved: number
  /** Per-item failures. Each move is its own transaction, so one missing record
   *  must not silently swallow the other nineteen — the caller reports both. */
  failures: AgendaMoveFailure[]
}

/**
 * Move a batch of agenda rows to new days.
 *
 * THE POINT OF THIS FILE: a booked job's date lives in TWO documents —
 * `Event.event_start`/`event_end` AND `Lead.event_date` — and `updateEvent`
 * writes only the event, with no cascade. The double-booking radar
 * (`computeCapacity` in lib/capacity/capacity.ts) filters on
 * `lead.event_date === date`, so an event-only reschedule leaves the radar
 * pointing at the day the job USED to be on: it stops flagging the real
 * conflict on the new day and invents one on the old. Both fields are written
 * in ONE transaction per job so the two records can never disagree.
 */
export async function bulkRescheduleAgenda(
  orgSlug: string,
  moves: AgendaMove[],
): Promise<BulkRescheduleResult> {
  if (!Array.isArray(moves) || moves.length === 0) throw new Error('Nothing to reschedule')
  if (moves.length > BULK_LIMIT) throw new Error(`Reschedule ${BULK_LIMIT} or fewer items at a time`)
  for (const m of moves) {
    if (m?.kind !== 'event' && m?.kind !== 'lead') throw new Error('That kind of row cannot be rescheduled')
    if (!m.id) throw new Error('Missing record id')
    if (!DAY_RE.test(m.date ?? '')) throw new Error('Pick a valid date')
    if (m.hours) {
      // A hold has no Event document, so there is nowhere honest to put hours.
      if (m.kind !== 'event') throw new Error('Only a booked job has working hours')
      if (!HHMM_RE.test(m.hours.start) || !HHMM_RE.test(m.hours.end)) throw new Error('Pick a valid time')
      if (m.hours.end <= m.hours.start) throw new Error('The end time must be after the start time')
    }
  }

  const orgId = await orgIdBySlug(orgSlug)
  if (!orgId) throw new Error('Org not found')
  await assertOrgAdmin(orgId)

  const failures: AgendaMoveFailure[] = []
  const touched: Array<{ leadId: string; date: string }> = []
  let moved = 0

  for (const m of moves) {
    try {
      const leadId = m.kind === 'event'
        ? await moveBookedJob(orgId, m.id, m.date, m.hours)
        : await moveHold(orgId, m.id, m.date)
      moved += 1
      if (leadId) touched.push({ leadId, date: m.date })
    } catch (err) {
      failures.push({ kind: m.kind, id: m.id, message: err instanceof Error ? err.message : 'Reschedule failed' })
    }
  }

  // Best-effort telemetry, after the business writes have committed. logActivity
  // swallows its own errors, so this can never fail an applied reschedule.
  await Promise.all(
    touched.map(({ leadId, date }) =>
      logActivity(orgId, {
        parent_type: 'opportunity',
        parent_id: leadId,
        // 'note' is the generic kind; ActivityEvent has no 'reschedule' member and
        // widening that shared union is not this surface's call.
        kind: 'note',
        summary: `Rescheduled to ${date}`,
      })
    )
  )

  return { moved, failures }
}

/**
 * ONE row, moved from the calendar grid itself (W3-J: drag, edge-drag, and the
 * `[` `]` `,` `.` `<` `>` keyboard equivalents).
 *
 * A deliberately THIN wrapper. The correctness trap this file exists for — a
 * booked job's date living in BOTH `Event.event_start`/`event_end` AND
 * `Lead.event_date`, with the double-booking radar keying off the latter — is
 * solved exactly once, in `moveBookedJob`'s single transaction. A second copy
 * of that logic for the single-item case is precisely how the radar gets
 * silently corrupted six months from now, so there isn't one: this calls the
 * same batch entry point with a one-item batch and inherits its validation, its
 * auth check, its transaction and its activity log unchanged.
 */
export async function rescheduleCalendarItem(
  orgSlug: string,
  move: AgendaMove,
): Promise<BulkRescheduleResult> {
  return bulkRescheduleAgenda(orgSlug, [move])
}

/**
 * The new [start, end] for a job moved to `date`: the SPAN is preserved (a
 * three-day festival stays three days) and so is any time-of-day suffix the
 * stored value carried — `event_start` is sometimes a bare 'YYYY-MM-DD'
 * (createMarketDay) and sometimes a full ISO timestamp.
 */
function shiftEventWindow(event: Pick<Event, 'event_start' | 'event_end'>, date: string): { event_start: string; event_end: string } {
  const rawStart = event.event_start ?? ''
  const rawEnd = event.event_end ?? rawStart
  const startYmd = rawStart.slice(0, 10)
  const endYmd = rawEnd.slice(0, 10)
  const span = startYmd && endYmd && endYmd > startYmd
    ? Math.round((Date.parse(`${endYmd}T00:00:00.000Z`) - Date.parse(`${startYmd}T00:00:00.000Z`)) / 86_400_000)
    : 0
  return {
    event_start: `${date}${rawStart.slice(10)}`,
    event_end: `${addDays(date, span)}${rawEnd.slice(10)}`,
  }
}

function eventsCol(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events')
}

function leadsCol(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

/**
 * ONE transaction, BOTH date fields. Returns the opportunity id whose
 * `event_date` was cascaded, or null when the job has no opportunity behind it
 * (a manually created event) or its `lead_id` dangles.
 *
 * Firestore requires every read before every write inside a transaction, hence
 * the two gets up front.
 */
async function moveBookedJob(
  orgId: string,
  eventId: string,
  date: string,
  hours?: { start: string; end: string },
): Promise<string | null> {
  const eventRef = eventsCol(orgId).doc(eventId)
  return adminDb.runTransaction<string | null>(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    if (!eventSnap.exists) throw new Error('Job not found')
    const event = eventSnap.data() as Event

    const leadRef = event.lead_id ? leadsCol(orgId).doc(event.lead_id) : null
    const leadSnap = leadRef ? await tx.get(leadRef) : null

    const now = new Date().toISOString()
    // The time-of-day write rides in the SAME update as the date write — a
    // retimed job that lost its date cascade would corrupt the radar just as
    // surely as a moved one.
    tx.update(eventRef, { ...shiftEventWindow(event, date), ...(hours ? { hours } : {}), updated_at: now })

    // The cascade the radar depends on. Skipped only when there is genuinely no
    // opportunity document to write — never as an optimisation.
    if (leadRef && leadSnap?.exists) {
      tx.update(leadRef, { event_date: date, updated_at: now })
      return event.lead_id ?? null
    }
    return null
  })
}

/** A tentative hold has no Event (buildCalendarFeed suppresses the lead row as
 *  soon as any event references it), so `Lead.event_date` is the whole fact. */
async function moveHold(orgId: string, leadId: string, date: string): Promise<string | null> {
  const leadRef = leadsCol(orgId).doc(leadId)
  return adminDb.runTransaction<string | null>(async (tx) => {
    const snap = await tx.get(leadRef)
    if (!snap.exists) throw new Error('Opportunity not found')
    tx.update(leadRef, { event_date: date, updated_at: new Date().toISOString() })
    return leadId
  })
}
