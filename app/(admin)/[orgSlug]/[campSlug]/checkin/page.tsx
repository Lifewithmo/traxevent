export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import { resolveTerminology } from '@/lib/event-types'
import { CheckinClient } from '@/components/admin/CheckinClient'

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { date } = await searchParams
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'checkin')

  const today = new Date().toISOString().slice(0, 10)
  const activeDate = date ?? today

  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, campId),
    getCheckinsForDate(orgId, campId, activeDate),
  ])

  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)
  const guardianMode = camp.registration_type === 'child'

  return (
    <CheckinClient
      orgId={orgId}
      campId={campId}
      orgSlug={orgSlug}
      campSlug={campSlug}
      date={activeDate}
      members={members}
      checkins={checkins}
      guardianMode={guardianMode}
      memberLabel={terminology.memberPlural}
    />
  )
}
