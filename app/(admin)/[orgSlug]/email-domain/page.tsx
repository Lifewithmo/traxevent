export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { EmailDomainClient } from '@/components/admin/EmailDomainClient'
import type { Org } from '@/lib/types'

export default async function EmailDomainPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() } as Org

  return (
    <EmailDomainClient
      orgId={org.id}
      initialDomain={org.sending_domain}
      initialStatus={org.sending_domain_status}
      initialRecords={org.sending_domain_records ?? []}
    />
  )
}
