export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getEventReportData, getFormSubmissionReport } from '@/actions/reports'
import { ReportsClient } from '@/components/admin/ReportsClient'

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'reports')
  const [data, formSubmissions] = await Promise.all([
    getEventReportData(orgId, eventId),
    getFormSubmissionReport(orgId, eventId),
  ])

  return (
    <ReportsClient
      orgId={orgId}
      eventId={eventId}
      eventName={event.name}
      registrationType={event.registration_type ?? 'individual'}
      data={data}
      formSubmissions={formSubmissions}
    />
  )
}
