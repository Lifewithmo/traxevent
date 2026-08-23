export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import type { OpsListItem } from '@/lib/types'

// UTC-labeled so a server-rendered stamp never lies about the operator's local
// time (this page has no client hydration to re-render it in their timezone).
function freshnessStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`
}

function List({ title, items }: { title: string; items: OpsListItem[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-600">Nothing derived for this list.</p>
      ) : (
        <ul className="text-sm">
          {items.map((i) => (
            <li key={`${i.resource_id}|${i.unit ?? ''}`} className="flex items-baseline gap-2 border-b border-dotted border-neutral-300 py-1">
              <span>{i.checked ? '☑' : '☐'}</span>
              <span className="flex-1">
                {i.name}
                {i.needs_conversion && <span className="ml-2 text-xs text-neutral-600">(check by eye)</span>}
              </span>
              <span className="tabular-nums">{i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`}</span>
            </li>
          ))}
        </ul>
      )}
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
  const [plan, headerList] = await Promise.all([getOpsPlan(orgId, eventId), headers()])
  if (!plan) return <div className="p-8">No ops plan for this event.</div>
  // Printed live-URL origin: the configured origin, else the request's own
  // host (correct on Vercel previews / brand-domain sessions). Deliberately
  // the same 3 inline lines as ops/runsheet/print — shared print-origin
  // helper not worth it until a third print page appears.
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ??
    (host ? `${headerList.get('x-forwarded-proto') ?? 'https'}://${host}` : 'https://traxevent.com')
  const loadoutUrl = `${origin}/${orgSlug}/${eventSlug}/ops/loadout`
  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">{event.name} — {plan.requirements.guests} guests</h1>
        <PrintButton />
      </div>
      {/* Freshness + the printed→live bridge (plain URL — QR is a named deferral). */}
      <p className="mb-6 text-xs text-neutral-600">
        List updated {freshnessStamp(plan.updated_at ?? plan.created_at)} · Live version: {loadoutUrl}
      </p>
      <List title="Shopping list" items={plan.shopping_list} />
      <List title="Packing list" items={plan.packing_list} />
    </div>
  )
}
