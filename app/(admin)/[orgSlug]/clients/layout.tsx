export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listCustomers } from '@/actions/customers'
import { listLeads } from '@/actions/leads'
import { buildClientList } from '@/lib/crm/client-list'
import { todayYmd } from '@/lib/opportunity-detail'
import { ClientQueueRail } from '@/components/admin/clients/ClientQueueRail'
import type { Lead } from '@/lib/types'

export default async function ClientsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const [customers, leads] = await Promise.all([listCustomers(orgId), listLeads(orgId)])
  const leadsByCustomerId: Record<string, Lead[]> = {}
  for (const l of leads) {
    if (!l.customer_id) continue
    leadsByCustomerId[l.customer_id] = [...(leadsByCustomerId[l.customer_id] ?? []), l]
  }

  // buildClientList hands back pre-grouped blocks (for the old table's group
  // headers); ClientQueueRail wants a flat ClientRow[] and does its own
  // grouping/filtering client-side, so flatten here.
  const data = buildClientList({ customers, leadsByCustomerId }, todayYmd())
  const rows = data.blocks.flatMap((block) => block.rows)

  return (
    // main (in the parent org layout) is `h-screen` worth of stretched, scrollable
    // box — see AdminSidebar's `h-screen sticky top-0` — so h-full here fills that
    // exactly. The rail and the detail pane each scroll independently.
    // Below md: stacked (ClientQueueRail's own mobile bar sits above the detail
    // pane; the rail itself goes off-canvas — see ClientQueueRail), mirroring
    // the org layout's `max-md:flex-col` around AdminSidebar.
    <div className="flex h-full min-h-0 max-md:flex-col">
      <ClientQueueRail orgSlug={orgSlug} rows={rows} />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
