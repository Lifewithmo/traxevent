import { adminDb } from '@/lib/firebase-admin'
import { kindOf } from '@/lib/occasions/kind'
import { getOpsPlanCore, opsPlanRef, sendRunSheetCore } from '@/lib/ops/event-ops'
import type { Event, OpsPlan, Org } from '@/lib/types'

// Evening-before run-sheet send — the scheduling substrate's first consumer
// (inc-3 S1.3 + B1). The cron route (app/api/cron/route.ts) calls
// runEveningSend; everything date/window-shaped is a pure exported helper so
// the math is testable without Firestore.
//
// The contract, spelled out:
//   - Only orgs WITH a timezone participate — a tz-less org is SKIPPED as
//     documented behavior, not an error (Vercel cron is always UTC; the org tz
//     field is what makes "18:00 local" computable at all).
//   - Send window is org-local hour ∈ [18, 21] — a CATCH-UP window, because
//     missed or delayed ticks are documented Vercel behavior (and the window
//     is also what lets a small set of fixed daily UTC ticks serve a band of
//     timezones — see the schedule note in app/api/cron/route.ts). Idempotency
//     comes from the date stamp below, NEVER from trusting the wall clock.
//   - Idempotency: `plan.evening_sent_for` is the covered DATE (event_start
//     sliced to YYYY-MM-DD — never a timestamp), and every compare slices
//     BOTH sides, because event_start is a mixed-format field in live data
//     (see listEventsStartingOn). Same date in any format → already sent; a
//     rescheduled event self-heals with zero clearing hooks — the stamp
//     simply stops matching the new event_start's date.
//   - Archived events never participate: archiving is the app's cancel path
//     and it leaves the ops plan intact — a cancelled job must not get
//     Pack-by/Leave-by instructions. Same post-fetch convention as
//     readiness-horizon/shopping-run/calendar (drafts DO participate there,
//     so they participate here too).
//   - Observability: the run returns {orgs_scanned, sent, skipped, errors},
//     and every participating org gets `ops_notifications.last_evening_run_at`
//     plus a sent count that ACCUMULATES across ticks covering the same
//     evening (`last_evening_for`) — later in-window catch-up ticks, which
//     send nothing thanks to idempotency, must not overwrite a real count
//     with 0. The settings liveness line can still distinguish a healthy
//     quiet night (first tick stamps 0) from a broken cron (no stamp).

export const EVENING_WINDOW_START_HOUR = 18
export const EVENING_WINDOW_END_HOUR = 21

export interface EveningSendSummary {
  orgs_scanned: number
  sent: number
  /** Orgs skipped BY DESIGN: no timezone, opted out, or outside the window.
   *  An in-window org with zero candidate events is NOT skipped — it was
   *  processed (its liveness stamp updates with a 0 count). */
  skipped: number
  errors: number
}

/**
 * Org-local clock facts for `now` in `timeZone` — Intl does the zone math, so
 * DST transitions are handled by ICU, not by us. Throws on an unknown zone
 * (the caller's per-org try/catch turns that into an `errors` count — a saved
 * zone Intl can't resolve is a broken config, not a documented skip).
 */
export function orgClock(now: Date, timeZone: string): { hour: number; today: string } {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const parts: Partial<Record<Intl.DateTimeFormatPart['type'], string>> = {}
  for (const p of raw) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  if (!parts.year || !parts.month || !parts.day || !parts.hour) {
    throw new Error(`Could not resolve clock parts for zone ${timeZone}`)
  }
  return {
    // Some ICU builds render midnight as '24' under hour12:false — normalize.
    hour: Number(parts.hour) % 24,
    today: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** B1 catch-up window: org-local hour ∈ [18, 21], inclusive both ends. */
export function isInEveningWindow(hour: number): boolean {
  return hour >= EVENING_WINDOW_START_HOUR && hour <= EVENING_WINDOW_END_HOUR
}

/** 'YYYY-MM-DD' + 1 calendar day. Pure Date.UTC math on the already-org-local
 *  day string, so it has NO zone dependence of its own (orgClock supplied the
 *  org-local "today"; rolling it forward is plain calendar arithmetic). */
export function nextDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new Error(`Bad day string: ${ymd}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
    .toISOString()
    .slice(0, 10)
}

/** Firestore/email seams, injectable for tests (the window + idempotency math
 *  stays pure above; these are the only effectful edges). */
export interface EveningSendDeps {
  listOrgs(): Promise<Array<{ id: string; org: Org }>>
  listEventsStartingOn(orgId: string, day: string): Promise<Array<{ id: string; event: Event }>>
  getPlan(orgId: string, eventId: string): Promise<OpsPlan | null>
  getOwnerEmail(orgId: string): Promise<string | undefined>
  sendRunSheet(orgId: string, eventId: string, email: string): Promise<void>
  markEveningSent(orgId: string, eventId: string, eventStart: string): Promise<void>
  /** `forDate` is the org-local "tomorrow" (YYYY-MM-DD) this run covered —
   *  the accumulation key: same evening adds to the stored count, a new
   *  evening resets it. */
  markOrgRun(orgId: string, at: string, sentCount: number, forDate: string): Promise<void>
}

export function defaultEveningSendDeps(): EveningSendDeps {
  return {
    async listOrgs() {
      const snap = await adminDb.collection('orgs').get()
      return snap.docs.map((d) => ({ id: d.id, org: d.data() as Org }))
    },
    async listEventsStartingOn(orgId, day) {
      // RANGE on the day, not equality: event_start is a MIXED-FORMAT field
      // in live data — usually 'YYYY-MM-DD', sometimes a full ISO timestamp
      // (actions/calendar-bulk.ts documents this; the old demo seeder wrote
      // full-ISO values, and shiftEventWindow preserves any suffix on
      // reschedule). '==' would silently skip every suffixed job — no error,
      // just a run sheet that never arrives. [day, nextDay) catches both
      // forms by string order. Still a single-field query, served by
      // Firestore's AUTOMATIC single-field index — no firestore.indexes.json
      // entry needed (the existing composite events entry there is
      // event_start+event_end, for a different query).
      const snap = await adminDb
        .collection('orgs').doc(orgId)
        .collection('events')
        .where('event_start', '>=', day)
        .where('event_start', '<', nextDay(day))
        .get()
      return snap.docs.map((d) => ({ id: d.id, event: d.data() as Event }))
    },
    getPlan: getOpsPlanCore,
    async getOwnerEmail(orgId) {
      // Same owner lookup shape as actions/intake-public.ts.
      const snap = await adminDb
        .collection('orgs').doc(orgId)
        .collection('members')
        .where('role', '==', 'owner')
        .limit(1)
        .get()
      if (snap.empty) return undefined
      return (snap.docs[0].data() as { email?: string }).email || undefined
    },
    async sendRunSheet(orgId, eventId, email) {
      // The SAME render+send the runsheet button uses (sendRunSheetCore) — the
      // core is guard-free; identity here is the org owner, and the gate is
      // the cron route's CRON_SECRET.
      await sendRunSheetCore(orgId, eventId, { email })
    },
    async markEveningSent(orgId, eventId, eventStart) {
      // Transaction-guarded, only-if-not-already-covering-this-date: a
      // concurrent tick that already stamped THIS date wins and we leave the
      // doc alone; a stale stamp from a PREVIOUS date is overwritten (that is
      // the reschedule self-heal). What is WRITTEN is always the sliced
      // YYYY-MM-DD (the field is documented date-stamped), and the same-date
      // guard slices the STORED value too — a pre-fix full-ISO stamp for the
      // same date still counts as covered. No updated_at bump — this is
      // bookkeeping, not an operator change, and must not re-freshen the
      // print pages' "List updated" line.
      const forDate = eventStart.slice(0, 10)
      const ref = opsPlanRef(orgId, eventId)
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) return
        const plan = snap.data() as OpsPlan
        if (plan.evening_sent_for?.slice(0, 10) === forDate) return
        tx.update(ref, { evening_sent_for: forDate })
      })
    },
    async markOrgRun(orgId, at, sentCount, forDate) {
      // Read-modify-write under a transaction (same idiom as markEveningSent):
      // the count ACCUMULATES while `last_evening_for` matches this run's
      // covered evening, and resets on a new evening. Without this, the
      // 19/20/21h catch-up ticks — which send nothing thanks to idempotency —
      // would overwrite a real count with 0 on virtually every night that DID
      // send. Dot-path updates so the opt-out flag under ops_notifications
      // survives.
      const ref = adminDb.collection('orgs').doc(orgId)
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) return
        const prev = (snap.data() as Org).ops_notifications
        const count =
          prev?.last_evening_for === forDate
            ? (prev.last_evening_sent_count ?? 0) + sentCount
            : sentCount
        tx.update(ref, {
          'ops_notifications.last_evening_run_at': at,
          'ops_notifications.last_evening_sent_count': count,
          'ops_notifications.last_evening_for': forDate,
        })
      })
    },
  }
}

/**
 * One cron tick. For each org with a timezone, not opted out, whose local hour
 * is in the catch-up window: every client_job starting TOMORROW (org-local
 * calendar math) that has an ops plan and no evening_sent_for stamp for that
 * date gets the inline run sheet emailed to the org owner.
 *
 * Failure isolation (B1): this is the first all-orgs enumeration in the
 * codebase — one bad org must not kill the tick, so each org runs inside its
 * own try/catch, and each event send inside its own as well.
 *
 * Send-then-stamp, deliberately: a failed send leaves the stamp unset, so the
 * next in-window tick retries (that is what the 18–21 catch-up window is FOR).
 * The rare cost is a duplicate email if a tick crashes between send and stamp
 * — a duplicated run sheet is harmless; a silently missing one is the failure
 * mode this feature exists to prevent. The stamp write itself is
 * transaction-guarded (see markEveningSent) so overlapping ticks never fight.
 */
export async function runEveningSend(
  now: Date = new Date(),
  deps: EveningSendDeps = defaultEveningSendDeps(),
): Promise<EveningSendSummary> {
  const summary: EveningSendSummary = { orgs_scanned: 0, sent: 0, skipped: 0, errors: 0 }
  const orgs = await deps.listOrgs()
  summary.orgs_scanned = orgs.length

  for (const { id: orgId, org } of orgs) {
    try {
      const tz = org.timezone
      if (!tz) {
        summary.skipped++ // documented behavior: tz-less orgs never participate
        continue
      }
      if (org.ops_notifications?.evening_run_sheet_opt_out) {
        summary.skipped++
        continue
      }
      const { hour, today } = orgClock(now, tz)
      if (!isInEveningWindow(hour)) {
        summary.skipped++
        continue
      }

      const tomorrow = nextDay(today)
      const events = await deps.listEventsStartingOn(orgId, tomorrow)

      // Owner email fetched once per org, and only when a send is actually due.
      let ownerEmailPromise: Promise<string | undefined> | null = null
      const ownerEmail = () => (ownerEmailPromise ??= deps.getOwnerEmail(orgId))

      let sentForOrg = 0
      for (const { id: eventId, event } of events) {
        try {
          // Archiving is the app's cancel path and it leaves the ops plan
          // intact — a cancelled job must never get Pack-by/Leave-by
          // instructions. Post-fetch skip, matching the repo convention
          // (readiness-horizon.ts, shopping-run.ts, calendar.ts all filter
          // status !== 'archived' — and none exclude drafts, so neither do we).
          if (event.status === 'archived') continue
          if (kindOf(event) !== 'client_job') continue
          const plan = await deps.getPlan(orgId, eventId)
          if (!plan) continue
          // Date-stamped idempotency, normalized on BOTH sides: event_start
          // may carry an ISO time suffix (mixed-format field — see
          // listEventsStartingOn) and a pre-fix stamp may too, but the
          // contract is the covered DATE. Same date in any format → already
          // sent; a stamp for a different date means the event was
          // rescheduled after a send, so the new date sends again.
          const coveredDate = event.event_start.slice(0, 10)
          if (plan.evening_sent_for?.slice(0, 10) === coveredDate) continue

          const email = await ownerEmail()
          if (!email) throw new Error('Org has no owner email on file')

          await deps.sendRunSheet(orgId, eventId, email)
          await deps.markEveningSent(orgId, eventId, coveredDate)
          sentForOrg++
          summary.sent++
        } catch (err) {
          summary.errors++
          console.error(`[evening-send] send failed for org ${orgId} event ${eventId}`, err)
        }
      }

      // Liveness stamp for EVERY processed (in-window, participating) org —
      // a 0-count run is a healthy quiet night, and must look different from
      // a cron that never ran. `tomorrow` keys the accumulation: catch-up
      // ticks covering the same evening ADD to the count (usually +0) instead
      // of overwriting the 18h tick's real count with 0.
      await deps.markOrgRun(orgId, now.toISOString(), sentForOrg, tomorrow)
    } catch (err) {
      summary.errors++
      console.error(`[evening-send] org ${orgId} failed`, err)
    }
  }
  return summary
}
