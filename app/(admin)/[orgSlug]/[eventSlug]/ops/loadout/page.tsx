export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { LoadoutClient } from '@/components/admin/ops/LoadoutClient'

// Phone-first load-out mode (spec 2026-08-19 S2) — same 'ops' page grant as the
// plan and closeout leaves (closeout/page.tsx precedent). No redirect when the
// plan is missing: the client renders a designed empty state that links back to
// /ops setup instead of silently bouncing.
export default async function LoadoutPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  return (
    <LoadoutClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      plan={plan}
      eventStart={event.event_start}
      eventHeadcount={event.headcount}
    />
  )
}
