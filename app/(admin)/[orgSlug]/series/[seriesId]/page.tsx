export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSeries, listSeriesDays } from '@/actions/series'
import { SeriesClient } from '@/components/admin/occasions/SeriesClient'

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; seriesId: string }>
}) {
  const { orgSlug, seriesId } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const series = await getSeries(orgId, seriesId)
  if (!series) notFound()
  const days = await listSeriesDays(orgId, seriesId)
  return (
    <SeriesClient
      orgId={orgId}
      orgSlug={orgSlug}
      series={series}
      days={days}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
    />
  )
}
