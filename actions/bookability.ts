'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { orgBySlug, loadCalendarEvents } from '@/lib/calendar-fetch'
import { listLeadsCore } from '@/lib/crm/leads'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { buildBookabilityCtx, type BookabilityCtx } from '@/lib/calendar-bookability'
import { todayYmd } from '@/lib/opportunity-detail'

// NOTE: this is a 'use server' module — every export must be an async function.
// BookabilityCtx (a type) is therefore NOT re-exported here; import it from
// '@/lib/calendar-bookability' directly. Re-exporting a type broke `next build`
// (RSC compiler) — see AGENTS.md.

/**
 * The Bookability Verdict's context, on demand — for surfaces that don't get
 * it threaded in at page render. The Clients cockpit calls this lazily the
 * first time its New-opportunity form opens, since most cockpit visits never
 * open the form.
 *
 * SLUG-ONLY, BY CONTRACT (C5b). An earlier signature took (orgId, orgSlug) as
 * two independent caller-controlled values: membership was asserted on the id
 * while the slug loaded ANY org's document — a cross-tenant read (plan,
 * prep_lead_days, profiles) and a slug-existence oracle. The org is now
 * resolved FROM the slug and membership is asserted on the RESOLVED id before
 * any further read; an unknown slug returns null (the form degrades silently).
 *
 * Reads, in full — a LEAN build, not the calendar's whole-cockpit
 * `loadCalendarSources` fan-out (leads + per-lead tasks + invoices +
 * compliance + drops), most of which the verdict never looks at:
 *   • the org doc  — 1 (the slug query returns the whole document);
 *   • events       — 1 (`loadCalendarEvents`, unbounded — same rows the
 *                    calendar renders, so demand can't disagree with it);
 *   • leads        — 1 (`listLeadsCore`);
 *   • units        — 1 more, business tier only (the same
 *                    `hasMultiResourceCapacity` gate the pipeline page uses).
 * So: 3 Firestore reads, 4 for a business-plan org.
 *
 * `today` is supplied here (todayYmd()) — a fresh action call, not a shared
 * per-request memo, so there is no cache key to keep stable.
 */
export async function getBookabilityCtx(orgSlug: string): Promise<BookabilityCtx | null> {
  const found = await orgBySlug(orgSlug)
  if (!found) return null
  await assertOrgMember(found.id)
  const [events, leads, units] = await Promise.all([
    loadCalendarEvents(found.id, null, null),
    listLeadsCore(found.id),
    hasMultiResourceCapacity(found.org)
      ? listCapacityUnitsCore(found.id)
      : Promise.resolve([]),
  ])
  return buildBookabilityCtx({ orgSlug, org: found.org, leads, events, units, today: todayYmd() })
}
