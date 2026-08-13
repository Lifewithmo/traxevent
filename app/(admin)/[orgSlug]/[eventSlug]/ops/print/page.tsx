export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import type { OpsListItem } from '@/lib/types'

function List({ title, items }: { title: string; items: OpsListItem[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <ul className="text-sm space-y-1">
        {items.map((i) => (
          <li key={`${i.resource_id}|${i.unit ?? ''}`}>
            {i.checked ? '☑' : '☐'} {i.name} — {i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function OpsPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  if (!plan) return <div className="p-8">No ops plan for this event.</div>
  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">{event.name} — {plan.requirements.guests} guests</h1>
        <PrintButton />
      </div>
      <List title="Shopping list" items={plan.shopping_list} />
      <List title="Packing list" items={plan.packing_list} />
    </div>
  )
}
