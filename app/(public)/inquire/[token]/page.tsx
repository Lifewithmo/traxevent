export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getIntakeFormInfo } from '@/actions/intake-public'
import { adminDb } from '@/lib/firebase-admin'
import { eventTypeProfileNames } from '@/lib/crm/event-type-options'
import { IntakeForm } from '@/components/public/IntakeForm'
import type { Org } from '@/lib/types'

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getIntakeFormInfo(token)
  if (!info) notFound()

  // Event types inc 1 (spec §5c): the select needs the org's ACTIVE type
  // NAMES only — no ids, no policy flags cross this public boundary. A
  // second lookup by the same public token (`intake_token` IS the
  // authorization, exactly like `getIntakeFormInfo`'s own read) rather than
  // widening that action's return shape, which its own test suite pins to
  // `{ org_name }` exactly.
  const orgSnap = await adminDb.collection('orgs').where('intake_token', '==', token).limit(1).get()
  const activeEventTypeNames = orgSnap.empty
    ? []
    : eventTypeProfileNames((orgSnap.docs[0].data() as Org).event_type_profiles)

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">{info.org_name}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Tell us about your event and we&apos;ll get back to you.
      </p>
      <IntakeForm token={token} orgName={info.org_name} activeEventTypeNames={activeEventTypeNames} />
    </div>
  )
}
