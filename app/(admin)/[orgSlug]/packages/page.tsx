export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listResources } from '@/actions/resources'
import { listWorkPackages } from '@/actions/work-packages'
import { getTemplatesForOrg, listChecklistTemplatesCore } from '@/lib/ops/checklist-templates'
import { getIndustryPack, catalogLabel } from '@/lib/industry-packs'
import { CatalogClient } from '@/components/admin/ops/CatalogClient'

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const [resources, packages, templates, own] = await Promise.all([
    listResources(orgId),
    listWorkPackages(orgId),
    getTemplatesForOrg(orgId, org.industry_pack_id),
    listChecklistTemplatesCore(orgId),
  ])
  return (
    <CatalogClient
      orgId={orgId}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      title={catalogLabel(getIndustryPack(org.industry_pack_id))}
      resources={resources}
      packages={packages}
      templates={templates}
      ownTemplateIds={own.map((t) => t.id)}
    />
  )
}
