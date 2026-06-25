export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { BulkOnboardClient } from '@/components/network/BulkOnboardClient'

export default async function BulkOnboardPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { networkId } = await requireNetworkAdmin(networkSlug)
  return <BulkOnboardClient networkId={networkId} />
}
