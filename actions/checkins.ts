'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { CheckinRecord, EventFormAssignment, EventMember, Family, FamilyMember } from '@/lib/types'
import { assertEventPage } from '@/lib/auth/assert'

function eventRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId)
}

function checkinsRef(orgId: string, eventId: string) {
  return eventRef(orgId, eventId).collection('checkins')
}

// ---------------------------------------------------------------------------
// Custody record shape (additive — CheckinRecord in lib/types.ts is unchanged)
// ---------------------------------------------------------------------------

export interface CheckinHistoryEntry {
  action: 'check_in' | 'check_out' | 'undo'
  at: string
  guardian?: string
  /** Exception marker: the guardian name was free-typed, not one of the family's listed adults. */
  flag?: 'unlisted_guardian'
}

/**
 * A checkin doc with the additive custody fields. `checked_in_at` is the LATEST
 * arrival (a child who left and returned); `first_checked_in_at` preserves the
 * original arrival forever, and `history` is the append-only audit trail. Docs
 * written before this contract have neither — `deriveHistory` reconstructs a
 * best-effort trail from the flat fields the first time they are touched.
 */
export interface CustodyCheckinRecord extends CheckinRecord {
  first_checked_in_at?: string
  guardian_flag?: 'unlisted_guardian'
  history?: CheckinHistoryEntry[]
}

function deriveHistory(prior: CustodyCheckinRecord): CheckinHistoryEntry[] {
  if (prior.history && prior.history.length > 0) return prior.history
  // Legacy doc: reconstruct the trail from the flat fields so nothing is lost
  // when we append to it.
  const derived: CheckinHistoryEntry[] = [{ action: 'check_in', at: prior.checked_in_at }]
  if (prior.checked_out_at) {
    derived.push({
      action: 'check_out',
      at: prior.checked_out_at,
      ...(prior.guardian_pickup_name ? { guardian: prior.guardian_pickup_name } : {}),
    })
  }
  return derived
}

// ---------------------------------------------------------------------------
// Roster projection
// ---------------------------------------------------------------------------

/**
 * Everything the check-in operator needs AT the moment of action, per row:
 * allergy/medical text, the family's open balance, who is allowed to pick the
 * child up (registering parent + emergency contact, for the guardian
 * quick-pick), and which required forms the family still owes.
 */
export interface CheckinRosterMember extends EventMember {
  /** Non-empty = the allergy/medical flag; the text itself is the badge label. */
  allergy_text: string
  /** amount_due - amount_paid when positive, else 0. Family-level, denormalized per member. */
  family_balance_due: number
  registering_parent: string
  emergency_contact_name: string
  emergency_contact_phone: string
  /** Template names of required registrant forms this family has not signed. */
  missing_form_names: string[]
}

/**
 * Sorted by family name then member name, server-side (data is already fully
 * fetched — no new indexes).
 *
 * Permission note (spec S5, accepted): anyone holding the `checkin` page grant
 * now also sees form-completion state and the family balance, via the reads
 * below. These previously required the `reports`/`families` grants. The spec
 * accepts this consequence: both flags exist to be seen at the check-in desk.
 */
export async function listAllEventMembers(orgId: string, eventId: string): Promise<CheckinRosterMember[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const ref = eventRef(orgId, eventId)

  // Mirrors actions/reports.ts getFormSubmissionReport's fetch shape, scoped to
  // required registrant forms.
  const [familiesSnap, assignmentsSnap, signedSnap] = await Promise.all([
    ref.collection('families').get(),
    ref.collection('form_assignments').get(),
    adminDb
      .collectionGroup('signed_forms')
      .where('org_id', '==', orgId)
      .where('event_id', '==', eventId)
      .get(),
  ])

  const requiredForms = assignmentsSnap.docs
    .map((d) => d.data() as EventFormAssignment)
    .filter((a) => a.required && a.audience === 'registrant')

  // `${familyId}:${assignmentId}` — signed_forms live under
  // families/{familyId}/signed_forms, so the family id is the grandparent doc id.
  const signedKeys = new Set<string>()
  for (const doc of signedSnap.docs) {
    const familyId = doc.ref.parent.parent?.id
    const assignmentId = (doc.data() as { assignment_id?: string }).assignment_id
    if (familyId && assignmentId) signedKeys.add(`${familyId}:${assignmentId}`)
  }

  const perFamily = await Promise.all(
    familiesSnap.docs
      .filter((d) => (d.data() as Family).registration_status !== 'cancelled')
      .map(async (familyDoc) => {
        const family = familyDoc.data() as Family
        const balance = Math.max(0, (family.amount_due ?? 0) - (family.amount_paid ?? 0))
        const missingFormNames = requiredForms
          .filter((a) => !signedKeys.has(`${familyDoc.id}:${a.id}`))
          .map((a) => a.template_name)
        const registeringParent = `${family.first_name ?? ''} ${family.last_name ?? ''}`.trim()

        const membersSnap = await ref
          .collection('families').doc(familyDoc.id)
          .collection('family_members').get()
        return membersSnap.docs.map((memberDoc) => {
          const m = memberDoc.data() as FamilyMember
          const allergyText = [m.allergies, m.medical_notes]
            .map((s) => (s ?? '').trim())
            .filter(Boolean)
            .join(' · ')
          return {
            member_id: memberDoc.id,
            family_id: familyDoc.id,
            first_name: m.first_name,
            last_name: m.last_name,
            family_name: family.last_name,
            allergy_text: allergyText,
            family_balance_due: balance,
            registering_parent: registeringParent,
            emergency_contact_name: family.emergency_contact?.name ?? '',
            emergency_contact_phone: family.emergency_contact?.phone ?? '',
            missing_form_names: missingFormNames,
          } as CheckinRosterMember
        })
      })
  )

  return perFamily.flat().sort(
    (a, b) =>
      (a.family_name ?? '').localeCompare(b.family_name ?? '') ||
      a.family_id.localeCompare(b.family_id) ||
      (a.first_name ?? '').localeCompare(b.first_name ?? '') ||
      (a.last_name ?? '').localeCompare(b.last_name ?? '')
  )
}

export async function getCheckinsForDate(
  orgId: string,
  eventId: string,
  date: string
): Promise<CustodyCheckinRecord[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const snap = await checkinsRef(orgId, eventId).where('date', '==', date).get()
  return snap.docs.map((d) => d.data() as CustodyCheckinRecord)
}

// ---------------------------------------------------------------------------
// Mutations — the custody contract (spec B2)
//
// These write a child-safety record. The contract:
//   - a re-check-in NEVER wholesale-overwrites the prior state: the original
//     arrival survives in `first_checked_in_at` and the full trail in `history`;
//   - undo restores exactly what was there before (or deletes a fresh create) —
//     it never forges a checkout;
//   - a free-typed guardian is logged as an exception, not silently accepted;
//   - family bulk actions are one atomic commit, never N serial awaits.
// ---------------------------------------------------------------------------

export interface CheckInMemberInput {
  date: string
  memberId: string
  familyId: string
  memberName: string
  checkedInBy?: string
}

function buildCheckInRecord(
  prior: CustodyCheckinRecord | null,
  input: CheckInMemberInput,
  now: string
): CustodyCheckinRecord {
  const base: CustodyCheckinRecord = {
    id: `${input.date}_${input.memberId}`,
    date: input.date,
    member_id: input.memberId,
    family_id: input.familyId,
    member_name: input.memberName,
    status: 'in',
    checked_in_at: now,
    first_checked_in_at: now,
    history: [{ action: 'check_in', at: now }],
    ...(input.checkedInBy ? { checked_in_by: input.checkedInBy } : {}),
  }
  if (!prior) return base
  // Re-check-in (child left and returned): the new doc is COMPUTED FROM the
  // prior snapshot — original arrival preserved, prior checkout preserved in
  // history. The finished cycle's checked_out_at/guardian move into history
  // rather than lingering as live fields on an 'in' record.
  return {
    ...base,
    first_checked_in_at: prior.first_checked_in_at ?? prior.checked_in_at,
    history: [...deriveHistory(prior), { action: 'check_in', at: now }],
  }
}

export async function checkInMember(
  orgId: string,
  eventId: string,
  input: CheckInMemberInput
): Promise<CustodyCheckinRecord> {
  await assertEventPage(orgId, eventId, 'checkin')
  const ref = checkinsRef(orgId, eventId).doc(`${input.date}_${input.memberId}`)
  const snap = await ref.get()
  const prior = snap.exists ? (snap.data() as CustodyCheckinRecord) : null
  const record = buildCheckInRecord(prior, input, new Date().toISOString())
  await ref.set(record)
  return record
}

export interface CheckOutOptions {
  /** The guardian name was free-typed rather than picked from the family's listed adults. */
  unlistedGuardian?: boolean
}

export async function checkOutMember(
  orgId: string,
  eventId: string,
  recordId: string,
  guardianPickupName?: string,
  options?: CheckOutOptions
): Promise<CustodyCheckinRecord> {
  await assertEventPage(orgId, eventId, 'checkin')
  const ref = checkinsRef(orgId, eventId).doc(recordId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Check-in record not found')
  const prior = snap.data() as CustodyCheckinRecord
  const update = buildCheckOutUpdate(prior, new Date().toISOString(), guardianPickupName, options)
  await ref.update(update)
  return { ...prior, ...update }
}

function buildCheckOutUpdate(
  prior: CustodyCheckinRecord,
  now: string,
  guardianPickupName?: string,
  options?: CheckOutOptions
): Partial<CustodyCheckinRecord> {
  const unlisted = options?.unlistedGuardian === true
  const entry: CheckinHistoryEntry = {
    action: 'check_out',
    at: now,
    ...(guardianPickupName ? { guardian: guardianPickupName } : {}),
    ...(unlisted ? { flag: 'unlisted_guardian' as const } : {}),
  }
  return {
    status: 'out',
    checked_out_at: now,
    history: [...deriveHistory(prior), entry],
    // Backfill the original arrival on legacy docs while we have the snapshot.
    ...(prior.first_checked_in_at ? {} : { first_checked_in_at: prior.checked_in_at }),
    ...(guardianPickupName ? { guardian_pickup_name: guardianPickupName } : {}),
    ...(unlisted ? { guardian_flag: 'unlisted_guardian' as const } : {}),
  }
}

export interface FamilyCheckInInput {
  date: string
  familyId: string
  members: { memberId: string; memberName: string }[]
  checkedInBy?: string
}

/** Check in every listed sibling in ONE atomic commit. */
export async function checkInFamily(
  orgId: string,
  eventId: string,
  input: FamilyCheckInInput
): Promise<CustodyCheckinRecord[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const refs = input.members.map((m) => checkinsRef(orgId, eventId).doc(`${input.date}_${m.memberId}`))
  const snaps = await Promise.all(refs.map((r) => r.get()))
  const batch = adminDb.batch()
  const records = input.members.map((m, i) => {
    const prior = snaps[i].exists ? (snaps[i].data() as CustodyCheckinRecord) : null
    const record = buildCheckInRecord(
      prior,
      {
        date: input.date,
        memberId: m.memberId,
        familyId: input.familyId,
        memberName: m.memberName,
        checkedInBy: input.checkedInBy,
      },
      now
    )
    batch.set(refs[i], record)
    return record
  })
  await batch.commit()
  return records
}

export interface FamilyCheckOutInput {
  recordIds: string[]
  /** ONE guardian capture, applied to every sibling in the list. */
  guardianPickupName?: string
  unlistedGuardian?: boolean
}

/** Check out every listed sibling under one guardian, in ONE atomic commit. */
export async function checkOutFamily(
  orgId: string,
  eventId: string,
  input: FamilyCheckOutInput
): Promise<CustodyCheckinRecord[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const refs = input.recordIds.map((id) => checkinsRef(orgId, eventId).doc(id))
  const snaps = await Promise.all(refs.map((r) => r.get()))
  const missing = snaps.findIndex((s) => !s.exists)
  if (missing >= 0) throw new Error('Check-in record not found')

  const batch = adminDb.batch()
  const records = snaps.map((snap, i) => {
    const prior = snap.data() as CustodyCheckinRecord
    const update = buildCheckOutUpdate(prior, now, input.guardianPickupName, {
      unlistedGuardian: input.unlistedGuardian,
    })
    batch.update(refs[i], update)
    return { ...prior, ...update } as CustodyCheckinRecord
  })
  await batch.commit()
  return records
}

export interface CheckinUndoChange {
  recordId: string
  /**
   * The record as it stood BEFORE the action being undone (captured client-side
   * at dispatch time). `null` = the action created the record fresh.
   */
  prior: CustodyCheckinRecord | null
}

/**
 * Within-session undo for check-in/out actions (single or bulk), one atomic
 * commit. A record the undone action created fresh is deleted; a record it
 * overwrote is restored to the captured prior snapshot with a reversal entry
 * appended to its history. This is a reversal, never a forged checkout: no
 * `checked_out_at` is invented.
 */
export async function undoCheckinChanges(
  orgId: string,
  eventId: string,
  changes: CheckinUndoChange[]
): Promise<void> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const batch = adminDb.batch()
  for (const change of changes) {
    const ref = checkinsRef(orgId, eventId).doc(change.recordId)
    if (change.prior === null) {
      batch.delete(ref)
    } else {
      batch.set(ref, {
        ...change.prior,
        history: [...deriveHistory(change.prior), { action: 'undo', at: now }],
      })
    }
  }
  await batch.commit()
}

export interface CheckinSummary {
  checkedIn: number
  checkedOut: number
  total: number
}

export async function getCheckinSummary(
  orgId: string,
  eventId: string,
  date: string
): Promise<CheckinSummary> {
  await assertEventPage(orgId, eventId, 'checkin')
  const snap = await checkinsRef(orgId, eventId).where('date', '==', date).get()
  let checkedIn = 0
  let checkedOut = 0
  snap.docs.forEach((d) => {
    const status = (d.data() as CheckinRecord).status
    if (status === 'in') checkedIn++
    else if (status === 'out') checkedOut++
  })
  return { checkedIn, checkedOut, total: snap.docs.length }
}
