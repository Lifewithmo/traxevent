export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getCommunicationLog } from '@/actions/communicate'
import { listMembers } from '@/actions/members'
import { getVerifiedSendingDomain } from '@/actions/domains'
import { CommunicateClient } from '@/components/admin/CommunicateClient'

export default async function CommunicatePage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'communicate')
  const [log, members, verifiedDomain] = await Promise.all([
    getCommunicationLog(orgId, eventId),
    listMembers(orgId),
    getVerifiedSendingDomain(orgId),
  ])

  return (
    <CommunicateClient
      orgId={orgId}
      eventId={eventId}
      eventName={event.name}
      fromDisplayName={event.from_display_name}
      log={log}
      members={members.map((m) => ({ uid: m.uid, name: m.display_name, email: m.email }))}
      verifiedDomain={verifiedDomain ?? null}
    />
  )
}
