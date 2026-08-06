export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listComplianceDocs } from '@/actions/compliance'
import { ComplianceClient } from '@/components/admin/ops/ComplianceClient'

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const docs = await listComplianceDocs(orgId)
  return (
    <ComplianceClient
      orgId={orgId}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      docs={docs}
    />
  )
}
