export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listNetworkOrgs } from '@/actions/networks'
import { getNetworkReportData } from '@/actions/reports'
import { NetworkDashboardClient } from '@/components/network/NetworkDashboardClient'

export default async function NetworkDashboardPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { network, networkId } = await requireNetworkAdmin(networkSlug)
  const [orgs, report] = await Promise.all([listNetworkOrgs(networkId), getNetworkReportData(networkId)])
  return <NetworkDashboardClient network={network} networkId={networkId} orgs={orgs} report={report} />
}
