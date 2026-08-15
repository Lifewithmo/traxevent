export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listDrops } from '@/actions/drops'
import { listOrdersForDropCore } from '@/lib/storefront/orders'
import { listProducts } from '@/actions/products'
import { getIndustryPack, storefrontLabel } from '@/lib/industry-packs'
import { StorefrontClient } from '@/components/admin/storefront/StorefrontClient'

export default async function DropsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const [drops, products] = await Promise.all([listDrops(orgId), listProducts(orgId)])
  // Per-drop order counts + revenue for the list cards (spec §6 screen 1).
  // Guard-free core is fine here: requireOrgMember already gated the page
  // (house precedent: packages/page.tsx calls listChecklistTemplatesCore).
  const orderSets = await Promise.all(drops.map((d) => listOrdersForDropCore(orgId, d.id)))
  const stats: Record<string, { count: number; revenue: number }> = {}
  drops.forEach((d, i) => {
    const live = orderSets[i].filter((o) => o.status === 'confirmed' || o.status === 'picked_up')
    stats[d.id] = { count: live.length, revenue: live.reduce((s, o) => s + o.total, 0) }
  })
  return (
    <StorefrontClient
      orgId={orgId}
      orgSlug={orgSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      title={storefrontLabel(getIndustryPack(org.industry_pack_id))}
      drops={drops}
      stats={stats}
      products={products}
    />
  )
}
