export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { getCommunicationLog } from '@/actions/communicate'
import { listMembers } from '@/actions/members'
import { getVerifiedSendingDomain } from '@/actions/domains'
import { CommunicateClient } from '@/components/admin/CommunicateClient'

export default async function CommunicatePage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'communicate')
  const [log, members, verifiedDomain] = await Promise.all([
    getCommunicationLog(orgId, campId),
    listMembers(orgId),
    getVerifiedSendingDomain(orgId),
  ])

  return (
    <CommunicateClient
      orgId={orgId}
      campId={campId}
      campName={camp.name}
      fromDisplayName={camp.from_display_name}
      log={log}
      members={members.map((m) => ({ uid: m.uid, name: m.display_name, email: m.email }))}
      verifiedDomain={verifiedDomain ?? null}
    />
  )
}
