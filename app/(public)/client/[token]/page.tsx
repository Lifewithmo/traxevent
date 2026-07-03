export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getClientPortal } from '@/actions/client-portal-public'
import { ClientPortalView } from '@/components/client-portal/ClientPortalView'

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const portal = await getClientPortal(token)
  if (!portal) notFound()
  return <ClientPortalView portal={portal} />
}
