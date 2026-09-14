'use server'

import { orgBookabilityCtx } from '@/lib/calendar-fetch'
import { todayYmd } from '@/lib/opportunity-detail'
import type { BookabilityCtx } from '@/lib/calendar-bookability'

// NOTE: this is a 'use server' module — every export must be an async function.
// BookabilityCtx (a type) is therefore NOT re-exported here; import it from
// '@/lib/calendar-bookability' directly. Re-exporting a type broke `next build`
// (RSC compiler) — see AGENTS.md.

/**
 * The Bookability Verdict's context, on demand — for surfaces that don't get
 * it threaded in at page render. The Clients cockpit calls this lazily the
 * first time its New-opportunity form opens, since most cockpit visits never
 * open the form and the ctx costs 2–3 reads.
 *
 * A thin wrapper by design: authorization (`assertOrgMember`), the org lookup,
 * and every read live inside `orgBookabilityCtx` (lib/calendar-fetch), so the
 * calendar layout and this action can never disagree about what the ctx holds.
 * This action only supplies `today` — the memoised ctx keys on it, and the
 * pipeline page passes the same local-date string.
 */
export async function getBookabilityCtx(
  orgId: string,
  orgSlug: string
): Promise<BookabilityCtx | null> {
  return orgBookabilityCtx(orgId, orgSlug, todayYmd())
}
