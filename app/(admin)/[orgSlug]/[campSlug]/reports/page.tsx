export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getEventReportData, getFormSubmissionReport } from '@/actions/reports'
import { ReportsClient } from '@/components/admin/ReportsClient'

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, campSlug, 'reports')
  const [data, formSubmissions] = await Promise.all([
    getEventReportData(orgId, eventId),
    getFormSubmissionReport(orgId, eventId),
  ])

  return (
    <ReportsClient
      orgId={orgId}
      eventId={eventId}
      eventName={event.name}
      registrationType={event.registration_type}
      data={data}
      formSubmissions={formSubmissions}
    />
  )
}
