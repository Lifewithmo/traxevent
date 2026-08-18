export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { CapacityUnitsClient } from '@/components/admin/settings/CapacityUnitsClient'

export default async function CapacitySettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)

  const unlocked = hasMultiResourceCapacity(org)
  const units = unlocked ? await listCapacityUnitsCore(orgId) : []

  return <CapacityUnitsClient orgId={orgId} initialUnits={units} locked={!unlocked} />
}
