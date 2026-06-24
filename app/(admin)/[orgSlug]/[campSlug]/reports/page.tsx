export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { getEventReportData, getFormSubmissionReport } from '@/actions/reports'
import { ReportsClient } from '@/components/admin/ReportsClient'

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'reports')
  const [data, formSubmissions] = await Promise.all([
    getEventReportData(orgId, campId),
    getFormSubmissionReport(orgId, campId),
  ])

  return (
    <ReportsClient
      orgId={orgId}
      campId={campId}
      campName={camp.name}
      registrationType={camp.registration_type}
      data={data}
      formSubmissions={formSubmissions}
    />
  )
}
