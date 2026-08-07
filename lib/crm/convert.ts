import { createEventCore, listEventsByLeadCore } from '@/lib/events'
import { leadsRef } from '@/lib/crm/leads'
import type { Event, EventRegistrationType, Lead } from '@/lib/types'
import type { Terminology } from '@/lib/event-types'

export interface ConvertToWorkInput {
  name: string
  date: string                        // YYYY-MM-DD; sets event_start AND event_end
  event_type_id: string
  registration_type: EventRegistrationType
  event_type_terminology?: Terminology
  headcount?: number
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Turn a won opportunity into a scheduled job.
 *
 * The one-job rule is enforced HERE, not in the schema: Event.lead_id has no
 * uniqueness constraint, so a booking that genuinely needs two dated events
 * (a rehearsal dinner and a reception) only needs this guard relaxed — no data
 * migration. See docs/superpowers/specs/2026-08-07-convert-to-work-design.md.
 *
 * Logs no activity: lib/activity.ts is server-only and cores must stay
 * importable by scripts. The calling action logs.
 *
 * Known accepted race: the "already scheduled" check below reads
 * `listEventsByLeadCore` and then, in a separate write, `createEventCore`
 * creates the job — the two are not transactional. Two concurrent conversions
 * of the same opportunity can therefore both pass the check and both create a
 * job. This is accepted rather than fixed: the failure mode is a duplicate
 * *draft* event on an opportunity whose schema already permits multiple jobs
 * by design (see above) — untidy and trivially deletable, not data
 * corruption. Closing the race would mean threading a Firestore `Transaction`
 * handle through `createEventCore`'s public signature, which `/new-event`
 * also calls and has no need for; the repo already rejected that shape of
 * tradeoff for `createLead` in the CRM finish-out plan's "Accepted tradeoff"
 * section, and the same reasoning applies here.
 */
export async function convertOpportunityToWorkCore(
  orgId: string,
  leadId: string,
  input: ConvertToWorkInput
): Promise<Event> {
  if (!input.name?.trim()) throw new Error('A job name is required')
  if (!input.date?.trim()) throw new Error('A job date is required')
  if (!DATE_FORMAT.test(input.date.trim())) throw new Error('A job date must be in YYYY-MM-DD format')

  const snap = await leadsRef(orgId).doc(leadId).get()
  if (!snap.exists) throw new Error('Opportunity not found')
  const lead = snap.data() as Lead
  if (lead.stage !== 'closed_won') throw new Error('Only a won opportunity can be scheduled')

  const existing = await listEventsByLeadCore(orgId, leadId)
  if (existing.length > 0) throw new Error('This opportunity is already scheduled')

  const date = input.date.trim()
  return createEventCore(orgId, {
    name: input.name.trim(),
    year: Number(date.slice(0, 4)),
    registration_type: input.registration_type,
    event_type_id: input.event_type_id,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    event_start: date,
    event_end: date,
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    lead_id: leadId,
  })
}
