export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { listEventPeople, listPermissionTemplates } from '@/actions/people'
import { listVolunteerHours } from '@/actions/volunteer-hours'
import { EventPeopleClient } from '@/components/admin/EventPeopleClient'
import { VolunteerHoursClient } from '@/components/admin/VolunteerHoursClient'

export default async function EventPeoplePage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await requireCampPage(orgSlug, campSlug, 'people')

  const [people, templates, hours] = await Promise.all([
    listEventPeople(orgId, campId),
    listPermissionTemplates(orgId),
    listVolunteerHours(orgId, campId),
  ])

  return (
    <>
      <EventPeopleClient orgId={orgId} campId={campId} people={people} templates={templates} />
      <VolunteerHoursClient orgId={orgId} campId={campId} volunteers={people.filter((p) => p.kind === 'volunteer')} entries={hours} />
    </>
  )
}
