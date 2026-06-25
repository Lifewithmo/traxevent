export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listNetworkOrgs } from '@/actions/networks'
import { NetworkBillingClient } from '@/components/network/NetworkBillingClient'

export default async function NetworkBillingPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { network, networkId } = await requireNetworkAdmin(networkSlug)
  const orgs = await listNetworkOrgs(networkId)
  return <NetworkBillingClient network={network} networkId={networkId} orgs={orgs} />
}
