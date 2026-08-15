export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { getIndustryPack, resolveEnabledModules, storefrontLabel } from '@/lib/industry-packs'
import { NewOccasionChooser } from '@/components/admin/occasions/NewOccasionChooser'

export default async function NewOccasionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await requireOrgMember(orgSlug)
  const pack = getIndustryPack(org.industry_pack_id)
  const modules = resolveEnabledModules(org.industry_pack_id)
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">What are you creating?</h1>
      <NewOccasionChooser
        orgSlug={orgSlug}
        storefrontEnabled={modules.includes('storefront')}
        dropLabel={storefrontLabel(pack)}
      />
    </div>
  )
}
