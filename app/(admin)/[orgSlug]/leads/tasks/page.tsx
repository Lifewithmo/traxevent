export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { KpiBand } from '@/components/ui/kpi-band'
import { PipelineStatTile } from '@/components/admin/pipeline/PipelineStatTile'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'
import { PipelineTasksList } from '@/components/admin/pipeline/PipelineTasksList'

export default async function PipelineTasksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const today = todayYmd()
  const leads = await listLeads(orgId)
  const open = leads.filter((l) => (OPEN_STAGES as (typeof l.stage)[]).includes(l.stage))
  const taskLists = await Promise.all(open.map((l) => listTasks(orgId, l.id)))
  const rows = open.flatMap((lead, i) => taskLists[i].map((task) => ({ lead, task })))
  const dueToday = rows.filter((r) => !r.task.done && r.task.due_date && r.task.due_date <= today).length

  // R2: the shape of the debt is already computed to group the rows — promote it
  // to figures instead of leaving it as 10px group headers the operator has to
  // scroll to assemble.
  const openRows = rows.filter((r) => !r.task.done)
  const overdueRows = openRows.filter((r) => r.task.due_date && r.task.due_date < today)
  const todayRows = openRows.filter((r) => r.task.due_date === today)
  const upcomingRows = openRows.filter((r) => r.task.due_date && r.task.due_date > today)
  const unscheduledRows = openRows.filter((r) => !r.task.due_date)
  const upcomingOwing = new Set(upcomingRows.map((r) => r.lead.id)).size

  return (
    <div>
      <PipelineSubNav orgSlug={orgSlug} active="tasks" openCount={open.length} dueTodayCount={dueToday} />
      {/* The Pipeline section's one frame, identical to leads/page.tsx. Without
          it, clicking Opportunities → Tasks under the SAME sub-nav jumped the
          content's left edge by ~380px at 1920. The band's rule is capped WITH
          the content, matching PipelineStatsHeader's own `border-y` on the
          opportunities page; only the sub-nav's rule runs full-bleed. */}
      <div className="mx-auto max-w-6xl border-b border-border px-6 py-4">
        <KpiBand>
          <PipelineStatTile
            label="Overdue"
            value={String(overdueRows.length)}
            tone={overdueRows.length > 0 ? 'alert' : 'default'}
            note={overdueRows.length > 0 ? 'past their due date' : 'nothing past due'}
            noteTone={overdueRows.length > 0 ? 'alert' : 'default'}
          />
          <PipelineStatTile
            label="Due today"
            value={String(todayRows.length)}
            note={todayRows.length > 0 ? 'owed before end of day' : 'nothing owed today'}
          />
          <PipelineStatTile
            label="Upcoming"
            value={String(upcomingRows.length)}
            note={`across ${upcomingOwing} opportunit${upcomingOwing === 1 ? 'y' : 'ies'}`}
          />
          <PipelineStatTile
            label="Unscheduled"
            value={String(unscheduledRows.length)}
            note={unscheduledRows.length > 0 ? 'no due date set' : 'everything is dated'}
          />
        </KpiBand>
      </div>
      <div className="mx-auto max-w-6xl">
        <PipelineTasksList orgSlug={orgSlug} today={today} rows={rows} />
      </div>
    </div>
  )
}
