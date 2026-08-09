export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
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

  return (
    <div>
      <PipelineSubNav orgSlug={orgSlug} active="tasks" openCount={open.length} dueTodayCount={dueToday} />
      <PipelineTasksList orgSlug={orgSlug} today={today} rows={rows} />
    </div>
  )
}
