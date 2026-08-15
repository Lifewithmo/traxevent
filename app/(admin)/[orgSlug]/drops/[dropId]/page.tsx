export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getDrop } from '@/actions/drops'
import { listProducts } from '@/actions/products'
import { DropEditorClient } from '@/components/admin/storefront/DropEditorClient'

export default async function DropEditorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; dropId: string }>
}) {
  const { orgSlug, dropId } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const [products, drop] = await Promise.all([listProducts(orgId), getDrop(orgId, dropId)])
  if (!drop) notFound()
  return (
    <DropEditorClient
      orgId={orgId}
      orgSlug={orgSlug}
      products={products}
      drop={drop}
      orgHasStripe={!!org.stripe_account_id}
      handle={org.public_profile?.enabled === true ? org.public_profile.handle : undefined}
      tipsEnabled={org.tips_enabled ?? false}
    />
  )
}
