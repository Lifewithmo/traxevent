export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listNetworkFormTemplates } from '@/actions/network-templates'
import { listNetworkOrgs } from '@/actions/networks'
import { NetworkTemplatesClient } from '@/components/network/NetworkTemplatesClient'

export default async function NetworkTemplatesPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { networkId } = await requireNetworkAdmin(networkSlug)
  const [templates, orgs] = await Promise.all([listNetworkFormTemplates(networkId), listNetworkOrgs(networkId)])
  return <NetworkTemplatesClient networkId={networkId} templates={templates} memberOrgCount={orgs.length} />
}
