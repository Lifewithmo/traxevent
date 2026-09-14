export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import type { BillingPlan, Org } from '@/lib/types'
import { listLeads } from '@/actions/leads'
import { listCustomers } from '@/actions/customers'
import { listTasks } from '@/actions/tasks'
import { listProposals } from '@/actions/proposals'
import { buildPipelineRows, closedThisMonth, radarConflictOpts, DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { buildBookabilityCtx } from '@/lib/calendar-bookability'
import { loadCalendarEvents } from '@/lib/calendar-fetch'
import { buildEventTypeOptions, eventTypeProfileNames, pastJobCounts } from '@/lib/crm/event-type-options'
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
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const orgData = orgSnap.docs[0].data()
  const prepLeadDays = (orgData.prep_lead_days as number | undefined) ?? DEFAULT_PREP_LEAD_DAYS
  const org = {
    plan: orgData.plan as BillingPlan | undefined,
    // Per-event-type resource profiles (Inc 4). Threaded into radarConflictOpts →
    // computeCapacity so the resource-aware radar honors "which kinds this event
    // type consumes"; absent ⇒ leadRequirement's default rule (backstop).
    event_type_profiles: orgData.event_type_profiles as Org['event_type_profiles'],
  }
  // The operator's kind vocabulary (increment 3 de-silo). Threaded into the
  // pipeline surface so the over-capacity pill's noun reads in their words via
  // `kindLabel`. Absent ⇒ the neutral platform defaults; base/solo orgs never
  // render the pill, so it is simply unused for them.
  const resourceLabels = orgData.resource_labels as Org['resource_labels']

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

  // The form's event-type chip vocabulary: profile names first, then the org's
  // own history by frequency (lib/crm/event-type-options — one rule shared
  // with the cockpit page). Whole-org history here: every lead, open or closed,
  // is a word the operator has actually used.
  const eventTypeOptions = buildEventTypeOptions(org.event_type_profiles, leads)

  // C5b's two recognition inputs, computed from data already in hand:
  // • the RAW profile vocabulary (independent of the merged chip list above —
  //   the form keys its "not a configured event type" hint on this);
  // • past-job counts per customer, over EVERY loaded lead (open or closed),
  //   for the caller-recognition hint's "{n} past jobs".
  const profileNames = eventTypeProfileNames(org.event_type_profiles)
  const jobCounts = pastJobCounts(leads)

  const shared = {
    orgId, orgSlug, groups, monthly, showDeliveryMode, eventTypeOptions, bookabilityCtx,
    eventTypeProfileNames: profileNames, pastJobCounts: jobCounts,
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
      {view === 'board'
        ? <PipelineBoardView {...shared} customers={customers} />
        : <PipelineListClient {...shared} openCount={open.length} closed={closed} customers={customers} resourceLabels={resourceLabels} eventTypeProfiles={org.event_type_profiles} />}
    </div>
  )
}
