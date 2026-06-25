export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getNetworkPortalByDomain } from '@/actions/network-portal'
import { NetworkPortalView } from '@/components/portal/NetworkPortalView'

export default async function PortalByDomainPage() {
  const host = (await headers()).get('host') ?? ''
  const portal = await getNetworkPortalByDomain(host)
  if (!portal) notFound()
  return <NetworkPortalView portal={portal} />
}
