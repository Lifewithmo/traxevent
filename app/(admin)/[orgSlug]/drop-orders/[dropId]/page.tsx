export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getDrop } from '@/actions/drops'
import { listOrdersForDrop } from '@/actions/orders'
import { OrdersBoardClient } from '@/components/admin/storefront/OrdersBoardClient'

export default async function DropOrdersPage({
  params,
}: {
  params: Promise<{ orgSlug: string; dropId: string }>
}) {
  const { orgSlug, dropId } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const drop = await getDrop(orgId, dropId)
  if (!drop) notFound()
  const orders = await listOrdersForDrop(orgId, dropId)
  return (
    <OrdersBoardClient
      orgId={orgId}
      orgSlug={orgSlug}
      drop={drop}
      orders={orders}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
    />
  )
}
