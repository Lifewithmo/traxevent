export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getNetworkPortalBySlug } from '@/actions/network-portal'
import { NetworkPortalView } from '@/components/portal/NetworkPortalView'

export default async function NetworkPortalPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const portal = await getNetworkPortalBySlug(networkSlug)
  if (!portal) notFound()
  return <NetworkPortalView portal={portal} />
}
