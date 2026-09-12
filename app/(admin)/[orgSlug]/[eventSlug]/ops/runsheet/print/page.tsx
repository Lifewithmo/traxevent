export const dynamic = 'force-dynamic'

// Printable call sheet — one page, same fixed hierarchy as the live run
// sheet: identity + anchor, contacts, site needs, timeline, checklists, load
// list summary, and the plain URL of the live sheet (the printed page goes
// stale the moment a box is ticked; the URL is the bridge back — QR variant
// is a named deferral pending a dependency decision).
//
// Paper never inverts: explicit bg-white / text-black utilities, not semantic
// tokens, so the document reads identically on screen in dark mode and out of
// the printer. Page-level @media print isolation (ops/print precedent): the
// event layout's chrome is print:hidden already; the style block below hides
// the sidebar and unclamps the scroll containers (the org <main> and the event
// layout's [data-event-main] div) — no pass-through layout needed.

import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { listItineraryCore } from '@/lib/itinerary-data'
import { formatTime, groupItineraryByDay } from '@/lib/itinerary'
import { formatEventDateRange, parseDay } from '@/lib/event-ui'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import { encodeQr, qrSvgPath, qrViewBox, type QrCode } from '@/lib/qr'
import { resolveAnchorTime, backPlanFromAnchor, bufferAssumptionLabel, RUN_SHEET_CHECKLIST_PHASES } from '../anchor'
import type { OpsListItem, Org } from '@/lib/types'

/** Printed→live bridge (inc-2 S4.1): null when the URL exceeds the vendored
 *  encoder's range — the plain URL beside it is the fallback, never a broken code. */
function tryEncodeQr(url: string): QrCode | null {
  try {
    return encodeQr(url)
  } catch {
    return null
  }
}

function listSummary(name: string, items: OpsListItem[]): string {
  const checked = items.filter((i) => i.checked).length
  return `${name}: ${checked} of ${items.length} packed`
}

export default async function RunSheetPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const [plan, itineraryItems, headerList, buffers] = await Promise.all([
    getOpsPlan(orgId, eventId),
    listItineraryCore(orgId, eventId),
    headers(),
    // Org back-plan buffers (inc-2 S4.3); soft-failing — constants remain the fallback.
    adminDb.collection('orgs').doc(orgId).get().then(
      (snap) => (snap.data() as Org | undefined)?.ops_buffers,
      () => undefined,
    ),
  ])

  const itinerary = groupItineraryByDay(itineraryItems)
  const anchor = resolveAnchorTime({
    serviceStart: plan?.requirements.service_start,
    hoursStart: event.hours?.start,
    itinerary,
  })
  const backPlan = anchor ? backPlanFromAnchor(anchor.hhmm, buffers) : null

  const startDay = parseDay(event.event_start)
  const singleDay = !event.event_end || event.event_end === event.event_start
  const dateLabel = singleDay && startDay
    ? startDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : formatEventDateRange(event.event_start, event.event_end)

  const checklists = (plan?.checklists ?? [])
    .filter((c) => (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).includes(c.phase))
    .sort(
      (a, b) =>
        (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).indexOf(a.phase) -
        (RUN_SHEET_CHECKLIST_PHASES as readonly string[]).indexOf(b.phase)
    )
  const contacts = event.key_contacts ?? []
  const multiDay = itinerary.length > 1

  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  const livePath = `/${orgSlug}/${eventSlug}/ops/runsheet`
  const liveUrl = host ? `${proto}://${host}${livePath}` : livePath
  // QR only for a full URL — a bare path scans into nothing useful.
  const qr = host ? tryEncodeQr(liveUrl) : null

  return (
    <>
      <style>{`
        @media print {
          aside { display: none !important; }
          main, [data-event-main] { padding: 0 !important; background: none !important; overflow: visible !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
      <div className="min-h-screen bg-white p-8 text-black">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{event.name}</h1>
            <p className="text-sm text-neutral-600">{dateLabel}</p>
          </div>
          <PrintButton />
        </div>

        <p className="text-3xl font-bold tabular-nums">
          {anchor ? (
            <>
              <span className="mr-2 align-middle text-sm font-medium text-neutral-600">{anchor.label}</span>
              {anchor.display}
            </>
          ) : (
            'Time TBD'
          )}
        </p>
        {backPlan && (
          <p className="mt-1 text-sm">
            Pack by <span className="font-semibold">{backPlan.packBy}</span> · Leave by{' '}
            <span className="font-semibold">{backPlan.leaveBy}</span>{' '}
            <span className="text-neutral-600">({bufferAssumptionLabel(buffers)})</span>
          </p>
        )}
        {event.location && (
          <p className="mt-1 text-sm">
            {event.location.name}
            {event.location.address && <span className="text-neutral-600"> · {event.location.address}</span>}
          </p>
        )}

        <section className="mt-6">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-neutral-600 uppercase">Contacts</h2>
          {contacts.length > 0 ? (
            <ul className="space-y-0.5 text-sm">
              {contacts.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name}</span>
                  {c.role && ` — ${c.role}`}
                  {c.phone && ` · ${c.phone}`}
                  {c.email && ` · ${c.email}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500 italic">None on file.</p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-neutral-600 uppercase">Site needs</h2>
          {plan && (plan.requirements.site_needs?.length ?? 0) > 0 ? (
            <p className="text-sm capitalize">{plan.requirements.site_needs!.join(' · ')}</p>
          ) : (
            <p className="text-sm text-neutral-500 italic">{plan ? 'None recorded.' : 'No ops plan.'}</p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-neutral-600 uppercase">Timeline</h2>
          {itinerary.length > 0 ? (
            <div className="space-y-3">
              {itinerary.map((day) => (
                <div key={day.day}>
                  {multiDay && <h3 className="text-sm font-semibold">{formatEventDateRange(day.day)}</h3>}
                  <ul className="text-sm">
                    {day.items.map((item) => (
                      <li key={item.id} className="flex gap-3 py-0.5">
                        <span className="w-20 shrink-0 font-medium tabular-nums">{formatTime(item.start_time)}</span>
                        <span>
                          {item.title}
                          {item.location && <span className="text-neutral-600"> · {item.location}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 italic">No schedule entered.</p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-neutral-600 uppercase">Checklists</h2>
          {checklists.length > 0 ? (
            <div className="space-y-3">
              {checklists.map((c) => (
                <div key={c.id}>
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <ul className="text-sm">
                    {c.steps.map((s, i) => (
                      <li key={i}>
                        {s.done ? '☑' : '☐'} {s.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 italic">
              {plan ? 'No setup or service checklists on this plan.' : 'No ops plan.'}
            </p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-neutral-600 uppercase">Load list</h2>
          {plan && plan.shopping_list.length + plan.packing_list.length > 0 ? (
            <p className="text-sm">
              {listSummary('Shopping', plan.shopping_list)} · {listSummary('Packing', plan.packing_list)}{' '}
              <span className="text-neutral-600">— full list on the load-out print.</span>
            </p>
          ) : (
            <p className="text-sm text-neutral-500 italic">{plan ? 'No load list yet.' : 'No ops plan.'}</p>
          )}
        </section>

        <div className="mt-8 flex items-start gap-3 border-t border-neutral-200 pt-3">
          {qr && (
            // Explicit white/black (paper rule) — the QR must scan on any screen theme.
            <svg viewBox={qrViewBox(qr)} className="size-20 shrink-0 bg-white" role="img" aria-label={`QR code for ${liveUrl}`} shapeRendering="crispEdges">
              <path d={qrSvgPath(qr)} fill="#000" />
            </svg>
          )}
          <p className="text-xs text-neutral-600">
            Live sheet (this paper goes stale): <span className="font-medium">{liveUrl}</span>
          </p>
        </div>
      </div>
    </>
  )
}
