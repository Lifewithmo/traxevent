export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listProducts } from '@/actions/products'
import { DropEditorClient } from '@/components/admin/storefront/DropEditorClient'

export default async function NewDropPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const products = await listProducts(orgId)
  return (
    <DropEditorClient
      orgId={orgId}
      orgSlug={orgSlug}
      products={products}
      drop={null}
      orgHasStripe={!!org.stripe_account_id}
      handle={org.public_profile?.enabled === true ? org.public_profile.handle : undefined}
      tipsEnabled={org.tips_enabled ?? false}
    />
  )
}
