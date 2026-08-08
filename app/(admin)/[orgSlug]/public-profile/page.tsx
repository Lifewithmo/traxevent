export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { PublicProfileClient } from '@/components/admin/PublicProfileClient'
import type { Org } from '@/lib/types'

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() } as Org

  return (
    <PublicProfileClient
      orgId={org.id}
      orgName={org.name}
      initialProfile={org.public_profile ?? null}
    />
  )
}
