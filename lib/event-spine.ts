// Guard-free KPI reads for the event spine band. Every read here MIRRORS an
// existing query shape — no new collections, no collectionGroup queries, no
// family_members subcollection reads, no new indexes. Auth is the caller's
// job: the event layout only calls this after requireEvent, and gates each
// section on the member's allowedPages.
import { adminDb } from '@/lib/firebase-admin'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { computeReadiness, type Readiness } from '@/lib/ops/readiness'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  type RegistrationSummary,
  type FinancialReport,
} from '@/lib/reports'
import type { Event, EventPage, Family } from '@/lib/types'

export interface EventSpineKpis {
  /** null = families gated off for this member, or the read failed. */
  registrations: RegistrationSummary | null
  /** null whenever registrations is (same source read). */
  financial: FinancialReport | null
  /** null = ops gated off, no ops plan yet, or the read failed. */
  readiness: Readiness | null
}

export interface GetEventSpineKpisInput {
  orgId: string
  eventId: string
  event: Pick<Event, 'event_start'>
  allowedPages: EventPage[]
}

/**
 * Aggregate the spine band's numbers. Each section is wrapped so a failed
 * read yields that section = null — the band renders its fallback and the
 * page never 500s over a KPI.
 */
export async function getEventSpineKpis({ orgId, eventId, event, allowedPages }: GetEventSpineKpisInput): Promise<EventSpineKpis> {
  const kpis: EventSpineKpis = { registrations: null, financial: null, readiness: null }

  await Promise.all([
    (async () => {
      if (!allowedPages.includes('families')) return
      try {
        // Same collection path + query as actions/admin-families.ts getAdminFamilies.
        const snap = await adminDb
          .collection('orgs').doc(orgId)
          .collection('events').doc(eventId)
          .collection('families')
          .orderBy('created_at', 'desc')
          .get()
        const families = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Family)
        kpis.registrations = buildRegistrationSummary(families)
        kpis.financial = buildFinancialReport(families)
      } catch {
        // section stays null
      }
    })(),
    (async () => {
      if (!allowedPages.includes('ops')) return
      try {
        const plan = await getOpsPlanCore(orgId, eventId)
        if (plan) kpis.readiness = computeReadiness(plan, event.event_start)
      } catch {
        // section stays null
      }
    })(),
  ])

  return kpis
}
