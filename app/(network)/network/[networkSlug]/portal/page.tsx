export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { NetworkPortalAdminClient } from '@/components/network/NetworkPortalAdminClient'

export default async function NetworkPortalAdminPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { network, networkId } = await requireNetworkAdmin(networkSlug)
  return <NetworkPortalAdminClient network={{ ...network, id: networkId }} />
}
