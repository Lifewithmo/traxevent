import { requireOrgMember, allowedEventPages } from '@/lib/auth/guards'
import { listEventsCore } from '@/lib/events'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { listResourcesCore } from '@/lib/ops/resources'
import { parseRunDays, selectShoppingRunWindow, type ShoppingRunPair } from '@/lib/ops/shopping-run'
import { todayYmd } from '@/lib/opportunity-detail'
import { ShoppingRunClient, type ShoppingRunJob } from '@/components/admin/ops/ShoppingRunClient'
import type { OpsPlan } from '@/lib/types'

// The shopping run — one store trip for every upcoming client job (spec
// 2026-08-23 S2). CLIENT JOBS ONLY: market days have no ops layer, so there is
// no derived list of theirs to merge (the window selector filters by kind).
// SHOPPING LISTS ONLY: packing stays per-event — gear custody doesn't fan out.
// Scope is URL-param state (?days=, ?exclude=), never persisted: a run doc
// only becomes necessary for SAVED runs, which are a named deferral.
export default async function ShoppingRunPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ days?: string; exclude?: string }>
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams])
  const { orgId, member } = await requireOrgMember(orgSlug)
  const days = parseRunDays(sp.days)
  const excluded = new Set((sp.exclude ?? '').split(',').filter(Boolean))

  const events = await listEventsCore(orgId)
  const today = todayYmd()
  // Row-gate BEFORE windowing (org-home horizon pattern): the cap never spends
  // slots on jobs whose ops page this member can't open, and the org-home
  // chip — computed over the same member-gated set — stays in agreement.
  const opsVisible = events.filter(
    (e) => allowedEventPages(member, e.id, ['ops'], e.department_id).length > 0,
  )
  const windowEvents = selectShoppingRunWindow(opsVisible, today, days)
  const included = windowEvents.filter((e) => !excluded.has(e.id))

  // Windowed fan-out, ≤ RUN_CAP plan reads. Per-read guard (actions/today.ts
  // pattern): one flaky Firestore read must not 500 the run, and a FAILED read
  // is EXCLUDED with a visible "couldn't check N" line — never silently
  // missing, and never coerced to null (null means "doc confirmed missing",
  // which honestly renders as a no-plan job).
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
  const noPlan = new Set<string>()
  let failedReads = 0
  included.forEach((e, i) => {
    const entry = reads[i]
    if (entry === 'unknown') failedReads += 1
    else if (entry === null) noPlan.add(e.id)
    else pairs.push({ event: { id: e.id, name: e.name, slug: e.slug, event_start: e.event_start }, plan: entry })
  })

  const failedIds = new Set(included.filter((_, i) => reads[i] === 'unknown').map((e) => e.id))
  const jobs: ShoppingRunJob[] = windowEvents
    // A job whose read failed can't honestly render as includable — it is
    // reported via the failed-reads line instead of a chip claiming a state.
    .filter((e) => !failedIds.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      event_start: e.event_start.slice(0, 10),
      excluded: excluded.has(e.id),
      no_plan: noPlan.has(e.id),
    }))

  return (
    <ShoppingRunClient
      orgId={orgId}
      orgSlug={orgSlug}
      days={days}
      jobs={jobs}
      pairs={pairs}
      resources={resources}
      failedReads={failedReads}
    />
  )
}
