export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan, getCloseout, getCloseoutSummary } from '@/actions/event-ops'
import { CloseoutClient } from '@/components/admin/ops/CloseoutClient'
import type { CloseoutSummary } from '@/lib/types'

export default async function CloseoutPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  if (!plan) redirect(`/${orgSlug}/${eventSlug}/ops`)

  const closeout = await getCloseout(orgId, eventId)
  let summary: CloseoutSummary | null = null
  let summaryError: string | null = null
  try {
    summary = await getCloseoutSummary(orgId, eventId)
  } catch (err: unknown) {
    summaryError = err instanceof Error ? err.message : 'Failed to compute summary'
  }

  return (
    <CloseoutClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      eventName={event.name}
      plan={plan}
      closeout={closeout}
      summary={summary}
      summaryError={summaryError}
      leads={[]}
    />
  )
}
