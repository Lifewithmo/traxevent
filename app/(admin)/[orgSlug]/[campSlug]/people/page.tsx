export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
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
  const { orgId, eventId } = await requireEventPage(orgSlug, campSlug, 'people')

  const [people, templates, hours] = await Promise.all([
    listEventPeople(orgId, eventId),
    listPermissionTemplates(orgId),
    listVolunteerHours(orgId, eventId),
  ])

  return (
    <>
      <EventPeopleClient orgId={orgId} eventId={eventId} people={people} templates={templates} />
      <VolunteerHoursClient orgId={orgId} eventId={eventId} volunteers={people.filter((p) => p.kind === 'volunteer')} entries={hours} />
    </>
  )
}
