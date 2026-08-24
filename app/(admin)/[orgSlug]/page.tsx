import { listEvents } from '@/actions/events'
import { listDepartments } from '@/actions/departments'
import { listSeries } from '@/actions/series'
import { requireOrgMember, allowedEventPages } from '@/lib/auth/guards'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import {
  horizonScope,
  selectHorizonWindow,
  selectReadinessHorizon,
  type HorizonPlanEntry,
} from '@/lib/ops/readiness-horizon'
import { RUN_DAYS, shoppingRunStats, type ShoppingRunPair } from '@/lib/ops/shopping-run'
import { kindOf } from '@/lib/occasions/kind'
import { EVENT_STATUS_TONE, EVENT_STATUS_LABEL, formatEventDateRange } from '@/lib/event-ui'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { DuplicateEventMenu } from '@/components/admin/DuplicateEventButton'
import { ReadinessHorizonRail } from '@/components/admin/events/ReadinessHorizonRail'
import { CalendarDays } from 'lucide-react'
import Link from 'next/link'

const SECTION_HEADING = 'mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'

export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // requireOrgMember (was getOrgBySlug): the readiness horizon row-gates by the
  // MEMBER's per-event/department ops grants — pure math over the member doc,
  // zero extra reads (the guard already fetched it).
  const { orgId, member } = await requireOrgMember(orgSlug)

  const [events, departments, seriesList] = await Promise.all([
    listEvents(orgId),
    listDepartments(orgId),
    listSeries(orgId),
  ])

  const clientJobs = events.filter((e) => kindOf(e) === 'client_job')
  const marketDays = events.filter((e) => kindOf(e) === 'market_day')

  const today = todayYmd()

  // ── Readiness horizon (S4) ─────────────────────────────────────────────
  // Row-gate BEFORE windowing so the 12-slot cap never spends slots on events
  // whose ops page this member can't open (owner/admin pass everything).
  const opsVisible = events.filter(
    (e) => allowedEventPages(member, e.id, ['ops'], e.department_id).length > 0
  )
  const horizonEvents = selectHorizonWindow(opsVisible, today)
  // Windowed fan-out: ≤12 plan-doc gets, only for events in the 14-day window —
  // cost ≤ Today's existing per-nav fan-out, zero new indexes. Caveat carried
  // from the spec: plan docs include an unbounded change_log; that bandwidth is
  // accepted today (a field mask on this fan-out is the named future trim).
  //
  // Per-read guard (mirrors actions/today.ts): one flaky Firestore read must
  // not 500 the whole events home, and a FAILED read becomes 'unknown' — the
  // selector EXCLUDES that event from the radar. Never coerce the error to
  // null: null means "doc confirmed missing" and would forge a false
  // 'No ops plan yet' alert. A genuinely missing doc resolves to null without
  // throwing and keeps its no-plan row.
  const horizonPlans = await Promise.all(
    horizonEvents.map(async (e): Promise<HorizonPlanEntry> => {
      try {
        return await getOpsPlanCore(orgId, e.id)
      } catch {
        return 'unknown'
      }
    })
  )
  const horizon = selectReadinessHorizon(
    horizonEvents,
    new Map<string, HorizonPlanEntry>(horizonEvents.map((e, i) => [e.id, horizonPlans[i]])),
    today
  )
  // Honesty bounds for the rail's quiet state: cap truncation + member scoping
  // (selector math) plus how many plan reads failed this pass (excluded above).
  const horizonRailScope = {
    ...horizonScope(events, opsVisible, today),
    unchecked: horizonPlans.filter((p) => p === 'unknown').length,
  }
  // ── Shopping-run chip (S2) — zero extra reads: pure math over the horizon
  // plans already fetched above, pinned to the run's default window. Parity
  // contract (documented on selectShoppingRunWindow): the horizon's capped
  // window restricted to ≤ RUN_DAYS is exactly the run page's default window
  // for this member, and shoppingRunStats counts merge-independent list
  // items — so this chip's number equals the run page's first render.
  const runWindowEnd = addDays(today, RUN_DAYS)
  const runStats = shoppingRunStats(
    horizonEvents.flatMap((e, i): ShoppingRunPair[] => {
      const p = horizonPlans[i]
      if (e.event_start.slice(0, 10) > runWindowEnd || p === 'unknown' || p === null) return []
      return [{ event: e, plan: p }]
    })
  )
  const upcoming = events.filter((e) => e.status !== 'archived' && e.event_start >= today)
  const nextStart = upcoming.length > 0
    ? upcoming.reduce((min, e) => (e.event_start < min ? e.event_start : min), upcoming[0].event_start)
    : null
  const guestsExpected = upcoming.reduce((sum, e) => sum + (e.headcount ?? 0), 0)

  const renderRow = (event: (typeof events)[number], showYear: boolean) => {
    const meta = [
      formatEventDateRange(event.event_start, event.event_end),
      event.headcount ? `${event.headcount} guests` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    // Stretched-link row: the container is the hover/hit surface, the Link's
    // after-overlay makes the whole row navigate, and the menu sits above the
    // overlay as a sibling so it receives its own clicks (never nested in the
    // anchor).
    return (
      <div
        key={event.id}
        className="relative flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50"
      >
        <Link
          href={`/${orgSlug}/${event.slug}/dashboard`}
          className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.name}</span>
          <StatusPill tone={EVENT_STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</StatusPill>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{meta}</span>
          {showYear && <Badge variant="outline">{event.year}</Badge>}
        </Link>
        <DuplicateEventMenu orgId={orgId} orgSlug={orgSlug} sourceEventId={event.id} sourceName={event.name} />
      </div>
    )
  }

  // Chronological within each group (fetch order is created_at); the year chip
  // appears only when a group spans multiple years and so needs disambiguating.
  const renderGroup = (groupEvents: typeof events) => {
    const sorted = [...groupEvents].sort((a, b) => a.event_start.localeCompare(b.event_start))
    const showYear = new Set(sorted.map((e) => e.year)).size > 1
    return (
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {sorted.map((e) => renderRow(e, showYear))}
      </div>
    )
  }

  const unassigned = clientJobs.filter((c) => !c.department_id || !departments.some((d) => d.id === c.department_id))
  const standalone = marketDays.filter((e) => !e.series_id)

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Events</h1>
          <p className="text-xs text-muted-foreground">
            {clientJobs.length} client job{clientJobs.length === 1 ? '' : 's'}
            {' · '}
            {marketDays.length} market day{marketDays.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button render={<Link href={`/${orgSlug}/new`} />}>New event</Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<CalendarDays />}
          title="No events yet"
          description="Create your first event to get started."
          action={<Button render={<Link href={`/${orgSlug}/new`} />}>Create an event</Button>}
        />
      ) : (
        <>
          <div className="px-5 pt-4">
            {/* The 'Client jobs' / 'Market days' census tiles are RETIRED
                (spec 2026-08-23 P1): they repeated the header caption above
                verbatim, and adding the run chip without subtracting would
                fail the no-value-twice gate. KpiBand's grid is a fixed 4-up
                (2-up below 1000px), so the band keeps exactly 4 tiles — the
                freed slots go to status facts nothing else on the page
                renders as counts. */}
            <KpiBand>
              <StatTile
                label="Upcoming"
                value={String(upcoming.length)}
                note={nextStart ? formatEventDateRange(nextStart) : undefined}
              />
              <StatTile
                label="Active"
                value={String(events.filter((e) => e.status === 'active').length)}
                note="confirmed on the books"
              />
              <StatTile
                label="Drafts"
                value={String(events.filter((e) => e.status === 'draft').length)}
                note="not yet confirmed"
              />
              <StatTile
                label="Guests expected"
                value={String(guestsExpected)}
                note="across upcoming events"
              />
            </KpiBand>
          </div>

          {/* Breakpoint contract: below lg the rail FOLDS ON TOP of the ledger —
              "what needs me next" beats the full filing view on a phone; at lg+
              it sits beside the ledger as a fixed 320px right rail
              (lg:grid-cols-[minmax(0,1fr)_320px], explicit col/row starts keep
              the DOM-first rail out of the 1fr column). */}
          <div className="grid items-start gap-x-6 gap-y-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <aside className="space-y-3 lg:col-start-2 lg:row-start-1">
              {/* Run chip — ADJACENT to the rail, not inside it (the rail
                  component belongs to a concurrent task). Rendered only when
                  the window holds jobs with shopping items: a run with
                  nothing in it has nothing to open. */}
              {runStats.jobs > 0 && (
                <Link
                  href={`/${orgSlug}/shopping-run`}
                  className="block rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs hover:bg-muted/50"
                >
                  <p className="text-sm font-medium">
                    Shopping run:{' '}
                    {runStats.unchecked > 0
                      ? `${runStats.unchecked} item${runStats.unchecked === 1 ? '' : 's'} across ${runStats.jobs} job${runStats.jobs === 1 ? '' : 's'}`
                      : `all ${runStats.total} item${runStats.total === 1 ? '' : 's'} bought`}
                    {' →'}
                  </p>
                  <p className="text-xs text-muted-foreground">next {RUN_DAYS} days · one store trip</p>
                </Link>
              )}
              <ReadinessHorizonRail orgSlug={orgSlug} rows={horizon} scope={horizonRailScope} />
            </aside>

            <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
              {clientJobs.length > 0 && (
                <section>
                  <h2 className={SECTION_HEADING}>Client jobs</h2>
                  {departments.length === 0 ? (
                    renderGroup(clientJobs)
                  ) : (
                    <div className="space-y-6">
                      {departments.map((dept) => {
                        const deptEvents = clientJobs.filter((c) => c.department_id === dept.id)
                        if (deptEvents.length === 0) return null
                        return (
                          <section key={dept.id}>
                            <h2 className={SECTION_HEADING}>{dept.name}</h2>
                            {renderGroup(deptEvents)}
                          </section>
                        )
                      })}
                      {unassigned.length > 0 && (
                        <section>
                          <h2 className={SECTION_HEADING}>Unassigned</h2>
                          {renderGroup(unassigned)}
                        </section>
                      )}
                    </div>
                  )}
                </section>
              )}

              {marketDays.length > 0 && (
                <section>
                  <h2 className={SECTION_HEADING}>Market days</h2>
                  <div className="space-y-6">
                    {seriesList.map((s) => {
                      const seriesDays = marketDays.filter((e) => e.series_id === s.id)
                      if (seriesDays.length === 0) return null
                      return (
                        <div key={s.id}>
                          <Link
                            href={`/${orgSlug}/series/${s.id}`}
                            className={`${SECTION_HEADING} block hover:text-foreground`}
                          >
                            {s.name}
                          </Link>
                          {renderGroup(seriesDays)}
                        </div>
                      )
                    })}
                    {standalone.length > 0 && renderGroup(standalone)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
