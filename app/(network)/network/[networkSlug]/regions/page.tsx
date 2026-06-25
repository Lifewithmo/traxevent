export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listRegions, listNetworkOrgs, listNetworkMembers } from '@/actions/networks'
import { RegionsClient } from '@/components/network/RegionsClient'

export default async function RegionsPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { networkId } = await requireNetworkAdmin(networkSlug)
  const [regions, orgs, members] = await Promise.all([
    listRegions(networkId),
    listNetworkOrgs(networkId),
    listNetworkMembers(networkId),
  ])
  return <RegionsClient networkId={networkId} regions={regions} orgs={orgs} members={members} />
}
