export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { requireOrgMember, allowedEventPages } from '@/lib/auth/guards'
import { listEventsCore } from '@/lib/events'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { listResourcesCore } from '@/lib/ops/resources'
import {
  computeShoppingRun, parseRunDays, selectShoppingRunWindow, shoppingRunStats,
  type ShoppingRunPair,
} from '@/lib/ops/shopping-run'
import { todayYmd } from '@/lib/opportunity-detail'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import type { OpsPlan } from '@/lib/types'

// Printed shopping run — the dead-zone insurance for a store with no signal.
// Same scope params as the live page (?days=, ?exclude=) so "Print" hands you
// exactly the run you were looking at.

function dayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function ShoppingRunPrintPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ days?: string; exclude?: string }>
}) {
  const [{ orgSlug }, sp, headerList] = await Promise.all([params, searchParams, headers()])
  const { orgId, member } = await requireOrgMember(orgSlug)
  const days = parseRunDays(sp.days)
  const excluded = new Set((sp.exclude ?? '').split(',').filter(Boolean))

  const events = await listEventsCore(orgId)
  const today = todayYmd()
  const opsVisible = events.filter(
    (e) => allowedEventPages(member, e.id, ['ops'], e.department_id).length > 0,
  )
  const included = selectShoppingRunWindow(opsVisible, today, days).filter((e) => !excluded.has(e.id))
  const [reads, resources] = await Promise.all([
    Promise.all(
      included.map(async (e): Promise<OpsPlan | null | 'unknown'> => {
        try {
          return await getOpsPlanCore(orgId, e.id)
        } catch {
          return 'unknown'
        }
      }),
    ),
    listResourcesCore(orgId),
  ])
  const pairs: ShoppingRunPair[] = []
  let failedReads = 0
  included.forEach((e, i) => {
    const entry = reads[i]
    if (entry === 'unknown') failedReads += 1
    else if (entry) pairs.push({ event: { id: e.id, name: e.name, slug: e.slug, event_start: e.event_start }, plan: entry })
  })
  const rows = computeShoppingRun(pairs, resources)
  const stats = shoppingRunStats(pairs)

  // Printed live-URL origin: the configured origin, else the request's own
  // host (correct on Vercel previews / brand-domain sessions). Same 3 inline
  // lines as ops/print and ops/runsheet/print — this is the third occurrence,
  // but those two files belong to a concurrent task, so the shared helper
  // extraction is deferred rather than colliding with it.
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ??
    (host ? `${headerList.get('x-forwarded-proto') ?? 'https'}://${host}` : 'https://traxevent.com')
  const q = new URLSearchParams()
  if (sp.days) q.set('days', sp.days)
  if (sp.exclude) q.set('exclude', sp.exclude)
  const liveUrl = `${origin}/${orgSlug}/shopping-run${q.toString() ? `?${q.toString()}` : ''}`

  return (
    // Paper never inverts: force both halves — white ground AND black ink — so
    // the document reads identically on a dark-mode screen and out of the printer.
    <div className="p-8 bg-white text-black min-h-screen">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">
          Shopping run — {stats.unchecked} of {stats.total} item{stats.total === 1 ? '' : 's'} across {stats.jobs} job{stats.jobs === 1 ? '' : 's'}
        </h1>
        <PrintButton />
      </div>
      <p className="mb-1 text-xs text-neutral-600">
        Next {days} days · printed {new Date().toISOString().slice(0, 10)} · Live version: {liveUrl}
      </p>
      <p className="mb-6 text-xs text-neutral-600">
        Rounded up per job — may overstate the combined need. On-hand stock isn&apos;t netted out.
        {failedReads > 0 && (
          <span className="font-semibold"> {failedReads} job{failedReads === 1 ? '' : 's'} couldn&apos;t be checked and {failedReads === 1 ? 'is' : 'are'} missing from this list.</span>
        )}
      </p>
      {pairs.length > 0 && (
        <p className="mb-6 text-sm">
          <span className="font-semibold">Jobs:</span>{' '}
          {pairs.map((p) => `${p.event.name} (${dayLabel(p.event.event_start.slice(0, 10))})`).join(' · ')}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600">Nothing to buy — no shopping lists derived in this window.</p>
      ) : (
        <ul className="text-sm">
          {rows.map((row) => (
            <li key={row.key} className="border-b border-dotted border-neutral-300 py-1">
              <div className="flex items-baseline gap-2">
                <span>{row.checked === 'all' ? '☑' : '☐'}</span>
                <span className="flex-1 font-medium">
                  {row.name}
                  {row.needs_conversion && <span className="ml-2 text-xs font-normal text-neutral-600">(check by eye)</span>}
                  {row.checked === 'partial' && <span className="ml-2 text-xs font-normal text-neutral-600">(partly bought)</span>}
                </span>
                <span className="tabular-nums">{row.unit ? `${row.qty} ${row.unit}` : `× ${row.qty}`}</span>
              </div>
              {/* Per-job breakdown: at the store the merged figure is what you
                  buy; back at the van this is how it splits per job. */}
              <ul className="ml-6 text-xs text-neutral-600">
                {row.constituents.map((c) => (
                  <li key={`${c.event_id}|${c.unit ?? ''}`} className="flex items-baseline gap-2">
                    <span>{c.checked ? '☑' : '☐'}</span>
                    <span className="flex-1">{c.event_name} · {dayLabel(c.event_start)}</span>
                    <span className="tabular-nums">{c.unit ? `${c.qty} ${c.unit}` : `× ${c.qty}`}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
