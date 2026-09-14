export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listLeads } from '@/actions/leads'
import { listCustomers } from '@/actions/customers'
import { listTasks } from '@/actions/tasks'
import { listProposals } from '@/actions/proposals'
import { buildPipelineRows, closedThisMonth, radarConflictOpts, DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { buildBookabilityCtx } from '@/lib/calendar-bookability'
import { loadCalendarEvents } from '@/lib/calendar-fetch'
import { pastJobCounts } from '@/lib/crm/event-type-options'
import { todayYmd } from '@/lib/opportunity-detail'
import { OPEN_STAGES, CLOSED_STAGES } from '@/lib/leads'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'
import { PipelineStatsHeader } from '@/components/admin/pipeline/PipelineStatsHeader'
import { wonValueInMonth, bookedAhead, backlogWindow, addMonths } from '@/lib/pipeline-stats'

export default async function LeadsPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const [{ orgSlug }, { view }] = await Promise.all([params, searchParams])
  // requireOrgMember (was a raw slug query): same org read + notFound, and it
  // also resolves the MEMBER — the inline event-type create is owner/admin
  // only (event types inc 1), and the role must be decided server-side. The
  // house idiom (drops/compliance/catalog pages resolve members the same way).
  const { org: orgDoc, orgId, member } = await requireOrgMember(orgSlug)
  const prepLeadDays = orgDoc.prep_lead_days ?? DEFAULT_PREP_LEAD_DAYS
  const org = {
    plan: orgDoc.plan,
    // Per-event-type resource profiles (Inc 4). Threaded into radarConflictOpts →
    // computeCapacity so the resource-aware radar honors "which kinds this event
    // type consumes"; absent ⇒ leadRequirement's default rule (backstop).
    event_type_profiles: orgDoc.event_type_profiles,
  }
  // The operator's kind vocabulary (increment 3 de-silo). Threaded into the
  // pipeline surface so the over-capacity pill's noun reads in their words via
  // `kindLabel`. Absent ⇒ the neutral platform defaults; base/solo orgs never
  // render the pill, so it is simply unused for them.
  const resourceLabels = orgDoc.resource_labels
  // A boolean, never the role itself: the create form only needs "may this
  // member mint event types" (owner/admin).
  const canCreateEventTypes = member.role === 'owner' || member.role === 'admin'

  // `loadCalendarEvents(orgId, null, null)` is the ONE Firestore read this
  // increment adds to the page (spec §6 Data, feasibility-verified): a single
  // whole-collection events query, so the form's bookability verdict reads
  // demand off the same events the calendar renders (see `calendarDemand`).
  // Deliberately NOT `orgEvents` — that door goes through the calendar's
  // memoised `loadCalendarSources` fan-out, which would re-read leads,
  // per-lead tasks, invoices, compliance and drops this page already loads (or
  // never needs) through its own queries. `loadCalendarEvents` is guard-free
  // by the calendar module's assert-first contract; the caller's guards are
  // the admin layout's `requireOrgMember(orgSlug)` (notFound for non-members
  // before this page's payload can render) and the asserting actions
  // (`listLeads`/`listCustomers`) in this same Promise.all. Folded into the
  // existing parallel fan-out so it costs latency nothing.
  const [leads, customers, events] = await Promise.all([
    listLeads(orgId), listCustomers(orgId), loadCalendarEvents(orgId, null, null),
  ])
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const closed = leads.filter((l) => CLOSED_STAGES.includes(l.stage))
  const inputs = await Promise.all(open.map(async (lead) => {
    const [tasks, proposals] = await Promise.all([
      listTasks(orgId, lead.id),
      lead.stage === 'proposal' ? listProposals(orgId, lead.id) : Promise.resolve([]),
    ])
    return { lead, tasks, proposals }
  }))

  const today = todayYmd()
  // Same-day booking conflicts across every lead that occupies a calendar slot
  // (open ∪ closed_won) — computed in-memory from the leads already loaded, no
  // new query. `buildPipelineRows` only sees the open inputs, so the conflict
  // set is what lets a still-open opp learn it collides with a booked job.
  //
  // Capacity mode (business tier WITH ≥1 configured unit): the radar becomes
  // resource-aware — conflict = a date whose demand (by kind) exceeds configured
  // supply, not merely ≥2 bookable leads. We fetch the org's capacity units once
  // (only for business-tier orgs — no query otherwise) and hand them to
  // `radarConflictOpts`, which owns the gate: base/solo orgs AND business orgs
  // with ZERO units fall back to the increment-1 conflictDates path byte-for-byte
  // (the non-negotiable backstop — a unit-less business org must NOT flag every
  // dated opp as over-capacity). The gate is tested in pipeline-view.test.ts.
  const units = hasMultiResourceCapacity(org) ? await listCapacityUnitsCore(orgId) : []
  const groups = buildPipelineRows(inputs, today, {
    prepLeadDays,
    eventTypeProfiles: org.event_type_profiles,
    ...radarConflictOpts(org, leads, units),
  })
  const monthly = closedThisMonth(leads, today)
  const openValue = open.reduce((s, l) => s + (l.estimated_value ?? 0), 0)

  // Everything OWED, not everything due TODAY: `due_date <= today` counts overdue
  // tasks as well. PipelineSubNav labels this badge "{n} owed" for exactly that
  // reason (see its comment) — the tasks page's own "Due today" tile counts
  // `=== today` and read as a contradiction when this was called "due today".
  // Keep the name, the predicate, and the label saying the same thing.
  const owedTaskCount = inputs.reduce(
    (n, { tasks }) => n + tasks.filter((t) => !t.done && t.due_date && t.due_date <= today).length,
    0
  )

  const ym = today.slice(0, 7)
  const stats = {
    bookedThisMonth: wonValueInMonth(leads, ym),
    bookedLastYearSameMonth: wonValueInMonth(leads, addMonths(ym, -12)),
    bookedNext90: bookedAhead(leads, today),
    openPipeline: { count: open.length, value: openValue },
    needsActionCount: groups.needs_attention.length,
    backlog: backlogWindow(leads, today),
    todayYm: ym,
  }

  // `openValue` is NOT threaded into the two clients. It already reaches the
  // screen exactly once, as `stats.openPipeline` on the KPI band below; the
  // separate prop was declared, destructured and never read on both surfaces.
  // Rendering it a second time would put the same figure on the page twice.
  // The delivery-mode toggle only makes sense with a room to host in: a
  // business-tier org with ≥1 ACTIVE venue unit. Derived from the units already
  // loaded above — no extra read — and false for every base/solo org (empty
  // `units`). Both pipeline surfaces get it so their create forms match.
  const showDeliveryMode = units.some((u) => u.kind === 'venue' && u.active)

  /*
    The create form's live-verdict context (New Opportunity inc 1). Built from
    what this render already holds — leads, units, today — plus the one added
    events read above; the form then answers "are you free Oct 4?" client-
    side with zero further I/O. A variable (not an inline literal) so
    `event_type_profiles` can ride along past `buildBookabilityCtx`'s
    Pick<'plan'|'prep_lead_days'> input type: the builder forwards its `org`
    verbatim to `radarConflictOpts`, which IS profile-aware, and the calendar's
    own `orgBookabilityCtx` passes the full org doc — dropping profiles here
    would make the form's verdict disagree with both the calendar cockpit and
    this very page's over-capacity pills.
  */
  const ctxOrg = { plan: org.plan, prep_lead_days: prepLeadDays, event_type_profiles: org.event_type_profiles }
  const bookabilityCtx = buildBookabilityCtx({ orgSlug, org: ctxOrg, leads, events, units, today })

  // C5b: past-job counts per customer, over EVERY loaded lead (open or
  // closed), for the caller-recognition hint's "{n} past jobs". (The form's
  // event-type picker — options, hint, delivery-mode hiding, event_type_id —
  // runs entirely against the org profile array threaded below; the old
  // history-mixed chip vocabulary is gone with the chips.)
  const jobCounts = pastJobCounts(leads)

  const shared = {
    orgId, orgSlug, groups, monthly, showDeliveryMode, bookabilityCtx,
    eventTypeProfiles: org.event_type_profiles, resourceLabels, canCreateEventTypes,
    pastJobCounts: jobCounts,
  }
  return (
    <div>
      {/* `units` is populated only for a business org (the gate above); a
          business org with ≥1 unit is exactly who the Capacity Outlook tab is
          for, so the same array gates the tab — no extra read. */}
      <PipelineSubNav
        orgSlug={orgSlug}
        active="opportunities"
        openCount={open.length}
        dueTodayCount={owedTaskCount}
        showCapacity={units.length > 0}
      />
      {/* Same `max-w-6xl` frame the two surfaces below use, so the KPI band and
          the rows share one left edge instead of the band running 400px wider. */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <PipelineStatsHeader stats={stats} />
      </div>
      {/* resourceLabels + eventTypeProfiles moved into `shared` (event types
          inc 1): the BOARD's create form needs them too now, and the two
          surfaces' forms must stay identical. */}
      {view === 'board'
        ? <PipelineBoardView {...shared} customers={customers} />
        : <PipelineListClient {...shared} openCount={open.length} closed={closed} customers={customers} />}
    </div>
  )
}
