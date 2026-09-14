export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import { encodeQr, qrSvgPath, qrViewBox, type QrCode } from '@/lib/qr'
import { zonedStampParts } from '@/lib/event-ui'
import type { OpsListItem, Org } from '@/lib/types'

/** Printed→live bridge (inc-2 S4.1): QR of the live URL, rendered from the
 *  vendored zero-dep encoder. null when the URL exceeds the encoder's range —
 *  the plain URL beside it is the fallback, never a broken code. */
function tryEncodeQr(url: string): QrCode | null {
  try {
    return encodeQr(url)
  } catch {
    return null
  }
}

// Freshness stamp (inc-3 S1.1 tz retrofit): org-local with the zone abbreviated
// ("2026-08-23 3:14 PM MDT") when Org.timezone is set — via the shared
// zonedStampParts, which assembles from Intl PARTS with U+202F normalized
// (PR #135: joined Intl output differs across runtimes; this is a server-only
// string, so pinned-zone Intl is safe, but we normalize defensively anyway).
// No/invalid timezone keeps the labeled-UTC fallback: a server-rendered stamp
// must never lie about the operator's local time (this page has no client
// hydration to re-render it in their timezone).
function freshnessStamp(iso: string, timeZone?: string): string {
  if (timeZone) {
    const zoned = zonedStampParts(iso, timeZone)
    if (zoned) return `${zoned.date} ${zoned.time} ${zoned.zone}`
  }
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
                {/* Shelf note (inc-3 S3.3) — read-only on paper, like the run. */}
                {i.note && <span className="block text-xs text-neutral-600">{i.note}</span>}
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
  const [plan, headerList, orgTimezone] = await Promise.all([
    getOpsPlan(orgId, eventId),
    headers(),
    // Org timezone for the freshness stamp (inc-3 S1.1); soft-failing — the
    // labeled-UTC fallback remains (ops/runsheet/print's org-read precedent).
    adminDb.collection('orgs').doc(orgId).get().then(
      (snap) => (snap.data() as Org | undefined)?.timezone,
      () => undefined,
    ),
  ])
  if (!plan) return <div className="p-8">No ops plan for this event.</div>
  // Printed live-URL origin: the configured origin, else the request's own
  // host (correct on Vercel previews / brand-domain sessions). Deliberately
  // the same 3 inline lines as ops/runsheet/print — shared print-origin
  // helper not worth it until a third print page appears.
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ??
    (host ? `${headerList.get('x-forwarded-proto') ?? 'https'}://${host}` : 'https://traxevent.com')
  const loadoutUrl = `${origin}/${orgSlug}/${eventSlug}/ops/loadout`
  const qr = tryEncodeQr(loadoutUrl)
  return (
    // Paper never inverts: force both halves — white ground AND black ink — so
    // the document reads identically on a dark-mode screen and out of the printer.
    <div className="p-8 bg-white text-black min-h-screen">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">{event.name} — {plan.requirements.guests} guests</h1>
        <PrintButton />
      </div>
      {/* Freshness + the printed→live bridge: QR (inc-2 S4.1) with the plain
          URL beside it — the paper goes stale the moment a box is ticked. */}
      <div className="mb-6 flex items-start gap-3">
        {qr && (
          // Explicit white/black (paper rule) — the QR must scan on any screen theme.
          <svg viewBox={qrViewBox(qr)} className="size-20 shrink-0 bg-white" role="img" aria-label={`QR code for ${loadoutUrl}`} shapeRendering="crispEdges">
            <path d={qrSvgPath(qr)} fill="#000" />
          </svg>
        )}
        <p className="text-xs text-neutral-600">
          List updated {freshnessStamp(plan.updated_at ?? plan.created_at, orgTimezone)} · Live version: {loadoutUrl}
        </p>
      </div>
      <List title="Shopping list" items={plan.shopping_list} />
      <List title="Packing list" items={plan.packing_list} />
    </div>
  )
}
