export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { BrandingClient } from '@/components/admin/BrandingClient'
import type { Org } from '@/lib/types'

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() } as Org

  return (
    <BrandingClient
      orgId={org.id}
      orgName={org.name}
      initialBranding={org.branding ?? {}}
      initialDefaultTerms={org.default_proposal_terms ?? ''}
    />
  )
}
