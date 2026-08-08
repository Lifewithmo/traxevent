export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { listProposals } from '@/actions/proposals'
import { buildPipelineRows, closedThisMonth } from '@/lib/pipeline-view'
import { todayYmd } from '@/lib/opportunity-detail'
import { OPEN_STAGES, CLOSED_STAGES } from '@/lib/leads'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'

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

  const leads = await listLeads(orgId)
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

  const shared = {
    orgId, orgSlug, groups,
    openCount: open.length, openValue, monthly,
  }
  return view === 'board'
    ? <PipelineBoardView {...shared} />
    : <PipelineListClient {...shared} closed={closed} />
}
