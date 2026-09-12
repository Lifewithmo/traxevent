import { createEventCore, listEventsByLeadCore } from '@/lib/events'
import { leadsRef } from '@/lib/crm/leads'
import type { Event, EventRegistrationType, EventHours, EventKeyContact, EventKind, Lead } from '@/lib/types'
import type { Terminology } from '@/lib/event-types'

export interface ConvertToWorkInput {
  name: string
  date: string                        // YYYY-MM-DD; sets event_start AND event_end
  event_type_id: string
  registration_type?: EventRegistrationType
  event_type_terminology?: Terminology
  kind?: EventKind
  headcount?: number
  // Optional booking time captured at conversion ('HH:mm' pair). A pair, not a
  // lone start: Event.hours is start+end everywhere it is read (calendar grid,
  // day spine, settings both-or-neither rule). NEVER derived from the Lead —
  // it has no time-of-day field (B7: time-source honesty).
  hours?: EventHours
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/
const TIME_FORMAT = /^\d{2}:\d{2}$/

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
 * by design (see above) — untidy, but it does not corrupt data. There is no
 * `deleteEvent` in this repo today, so cleaning one up means a Firestore
 * console operation, not a UI action; that is a real cost, accepted along
 * with the race itself. Closing the race would mean threading a Firestore `Transaction`
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
  if (input.headcount !== undefined && (!Number.isFinite(input.headcount) || input.headcount <= 0)) {
    throw new Error('Headcount must be a positive number')
  }
  if (input.hours) {
    if (!TIME_FORMAT.test(input.hours.start) || !TIME_FORMAT.test(input.hours.end)) {
      throw new Error('Times must be in HH:mm format')
    }
    if (input.hours.end <= input.hours.start) {
      throw new Error('End time must be after the start time')
    }
  }

  const snap = await leadsRef(orgId).doc(leadId).get()
  if (!snap.exists) throw new Error('Opportunity not found')
  const lead = snap.data() as Lead
  if (lead.stage !== 'closed_won') throw new Error('Only a won opportunity can be scheduled')

  const existing = await listEventsByLeadCore(orgId, leadId)
  if (existing.length > 0) throw new Error('This opportunity is already scheduled')

  // Seed the job's key contacts from the person the deal was won with — the
  // run sheet's tap-to-call chips are empty otherwise, and this is the one
  // moment the CRM record and the job are guaranteed to be in the same hand.
  // Name only, never a time: the Lead has no time-of-day field (B7).
  const clientContact: EventKeyContact | null = lead.name?.trim()
    ? {
        name: lead.name.trim(),
        role: 'Client',
        ...(lead.phone?.trim() ? { phone: lead.phone.trim() } : {}),
        ...(lead.email?.trim() ? { email: lead.email.trim() } : {}),
      }
    : null

  const date = input.date.trim()
  return createEventCore(orgId, {
    name: input.name.trim(),
    year: Number(date.slice(0, 4)),
    ...(input.registration_type ? { registration_type: input.registration_type } : {}),
    event_type_id: input.event_type_id,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    event_start: date,
    event_end: date,
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    ...(input.hours ? { hours: input.hours } : {}),
    ...(clientContact ? { key_contacts: [clientContact] } : {}),
    lead_id: leadId,
  })
}
