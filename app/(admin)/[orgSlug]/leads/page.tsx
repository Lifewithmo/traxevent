export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { listCustomers } from '@/actions/customers'
import { listTasks } from '@/actions/tasks'
import { listProposals } from '@/actions/proposals'
import { buildPipelineRows, closedThisMonth } from '@/lib/pipeline-view'
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

  const [leads, customers] = await Promise.all([listLeads(orgId), listCustomers(orgId)])
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
  const groups = buildPipelineRows(inputs, today)
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
  const shared = { orgId, orgSlug, groups, monthly }
  return (
    <div>
      <PipelineSubNav orgSlug={orgSlug} active="opportunities" openCount={open.length} dueTodayCount={owedTaskCount} />
      {/* Same `max-w-6xl` frame the two surfaces below use, so the KPI band and
          the rows share one left edge instead of the band running 400px wider. */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <PipelineStatsHeader stats={stats} />
      </div>
      {view === 'board'
        ? <PipelineBoardView {...shared} customers={customers} />
        : <PipelineListClient {...shared} openCount={open.length} closed={closed} customers={customers} />}
    </div>
  )
}
