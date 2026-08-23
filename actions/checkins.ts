'use server'

import { randomUUID } from 'crypto'
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
  /**
   * Stable id stamped SERVER-SIDE at write time. Undo references an action by
   * this id — the client never sends record data back. Entries reconstructed
   * from legacy flat fields have no id (they predate the contract and can
   * never be the target of an undo).
   */
  id?: string
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
//   - every mutation is a Firestore TRANSACTION (read prior + write inside one
//     contention-checked unit), so a stale device racing another station can
//     never wholesale-clobber a concurrent custody write;
//   - undo is SERVER-AUTHORITATIVE: the client sends only (recordId, entryId);
//     the server verifies the referenced action is still the LATEST history
//     entry and derives the restore state from the doc's OWN history — it never
//     accepts client-authored record data and never forges a checkout;
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
  const entry: CheckinHistoryEntry = { id: randomUUID(), action: 'check_in', at: now }
  const base: CustodyCheckinRecord = {
    id: `${input.date}_${input.memberId}`,
    date: input.date,
    member_id: input.memberId,
    family_id: input.familyId,
    member_name: input.memberName,
    status: 'in',
    checked_in_at: now,
    first_checked_in_at: now,
    history: [entry],
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
    history: [...deriveHistory(prior), entry],
  }
}

export async function checkInMember(
  orgId: string,
  eventId: string,
  input: CheckInMemberInput
): Promise<CustodyCheckinRecord> {
  await assertEventPage(orgId, eventId, 'checkin')
  const ref = checkinsRef(orgId, eventId).doc(`${input.date}_${input.memberId}`)
  const now = new Date().toISOString()
  // Transactional read-modify-write: a concurrent checkout on another station
  // forces a retry against the fresh doc instead of being clobbered by a
  // record computed from a stale snapshot.
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const prior = snap.exists ? (snap.data() as CustodyCheckinRecord) : null
    const record = buildCheckInRecord(prior, input, now)
    tx.set(ref, record)
    return record
  })
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
  const now = new Date().toISOString()
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Check-in record not found')
    const prior = snap.data() as CustodyCheckinRecord
    const update = buildCheckOutUpdate(prior, now, guardianPickupName, options)
    tx.update(ref, update)
    return { ...prior, ...update }
  })
}

function buildCheckOutUpdate(
  prior: CustodyCheckinRecord,
  now: string,
  guardianPickupName?: string,
  options?: CheckOutOptions
): Partial<CustodyCheckinRecord> {
  const unlisted = options?.unlistedGuardian === true
  const entry: CheckinHistoryEntry = {
    id: randomUUID(),
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

/** Check in every listed sibling in ONE atomic, contention-checked commit. */
export async function checkInFamily(
  orgId: string,
  eventId: string,
  input: FamilyCheckInInput
): Promise<CustodyCheckinRecord[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const refs = input.members.map((m) => checkinsRef(orgId, eventId).doc(`${input.date}_${m.memberId}`))
  return adminDb.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r)))
    return input.members.map((m, i) => {
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
      tx.set(refs[i], record)
      return record
    })
  })
}

export interface FamilyCheckOutInput {
  recordIds: string[]
  /** ONE guardian capture, applied to every sibling in the list. */
  guardianPickupName?: string
  unlistedGuardian?: boolean
}

/** Check out every listed sibling under one guardian, in ONE atomic, contention-checked commit. */
export async function checkOutFamily(
  orgId: string,
  eventId: string,
  input: FamilyCheckOutInput
): Promise<CustodyCheckinRecord[]> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const refs = input.recordIds.map((id) => checkinsRef(orgId, eventId).doc(id))
  return adminDb.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r)))
    const missing = snaps.findIndex((s) => !s.exists)
    if (missing >= 0) throw new Error('Check-in record not found')

    return snaps.map((snap, i) => {
      const prior = snap.data() as CustodyCheckinRecord
      const update = buildCheckOutUpdate(prior, now, input.guardianPickupName, {
        unlistedGuardian: input.unlistedGuardian,
      })
      tx.update(refs[i], update)
      return { ...prior, ...update } as CustodyCheckinRecord
    })
  })
}

export interface CheckinUndoChange {
  recordId: string
  /**
   * The server-stamped id of the history entry whose action is being undone
   * (taken from the record the mutation returned). This is an OPERATION
   * REFERENCE, not record data — the server derives everything else itself.
   */
  entryId: string
}

export type UndoCheckinResult =
  /** The undo applied. `records[i]` is the post-undo record for `changes[i]` (null = deleted). */
  | { ok: true; records: (CustodyCheckinRecord | null)[] }
  /**
   * A referenced action is no longer the latest entry on its record — another
   * station wrote in between. NOTHING was written; `records[i]` is the current
   * server state for `changes[i]` (null = the doc no longer exists) so the
   * client can reconcile its rows to the truth instead of retrying blindly.
   */
  | { ok: false; reason: 'stale'; records: (CustodyCheckinRecord | null)[] }

/**
 * `history` entries that are still in effect: check_in/check_out push, and an
 * `undo` entry pops the action it reversed. The result is the sequence of live
 * actions a replay must apply.
 */
function effectiveEntries(history: CheckinHistoryEntry[]): CheckinHistoryEntry[] {
  const stack: CheckinHistoryEntry[] = []
  for (const e of history) {
    if (e.action === 'undo') stack.pop()
    else stack.push(e)
  }
  return stack
}

interface ReplayedCustodyState {
  status: 'in' | 'out'
  checked_in_at: string
  first_checked_in_at: string
  checked_out_at?: string
  guardian_pickup_name?: string
  guardian_flag?: 'unlisted_guardian'
}

/**
 * The live custody fields implied by a sequence of effective history entries —
 * the ONLY source an undo restores from. `null` = no surviving action (the
 * record should not exist).
 */
function replayCustodyState(entries: CheckinHistoryEntry[]): ReplayedCustodyState | null {
  let status: 'in' | 'out' | null = null
  let checkedInAt = ''
  let firstCheckedInAt: string | undefined
  let checkedOutAt: string | undefined
  let guardian: string | undefined
  let flag: 'unlisted_guardian' | undefined

  for (const e of entries) {
    if (e.action === 'check_in') {
      // A (re-)check-in opens a fresh cycle: no live checkout fields.
      status = 'in'
      checkedInAt = e.at
      if (firstCheckedInAt === undefined) firstCheckedInAt = e.at
      checkedOutAt = undefined
      guardian = undefined
      flag = undefined
    } else if (e.action === 'check_out' && status !== null) {
      status = 'out'
      checkedOutAt = e.at
      guardian = e.guardian
      flag = e.flag
    }
  }

  if (status === null) return null
  return {
    status,
    checked_in_at: checkedInAt,
    first_checked_in_at: firstCheckedInAt ?? checkedInAt,
    ...(checkedOutAt ? { checked_out_at: checkedOutAt } : {}),
    ...(guardian ? { guardian_pickup_name: guardian } : {}),
    ...(flag ? { guardian_flag: flag } : {}),
  }
}

/**
 * Within-session undo for check-in/out actions (single or bulk) — SERVER-
 * AUTHORITATIVE and TRANSACTIONAL. The client identifies the action by
 * (recordId, entryId) only. Inside one Firestore transaction the server:
 *
 *   1. reads the current doc;
 *   2. verifies the referenced action is STILL the latest history entry — if a
 *      newer entry exists (a concurrent pickup on another station), the whole
 *      undo is rejected as stale with ZERO writes and the current records are
 *      returned for the client to reconcile;
 *   3. derives the restore state from the doc's OWN history (never from
 *      anything the client sent): the action's opening entry gone → delete the
 *      record; otherwise rebuild the prior custody state by replay and append
 *      the reversal as a new history entry.
 *
 * This is a reversal, never a forged checkout: no timestamp, guardian, or
 * history entry can be authored by the client, and a concurrent real custody
 * write can never be destroyed.
 */
export async function undoCheckinChanges(
  orgId: string,
  eventId: string,
  changes: CheckinUndoChange[]
): Promise<UndoCheckinResult> {
  await assertEventPage(orgId, eventId, 'checkin')
  const now = new Date().toISOString()
  const refs = changes.map((c) => checkinsRef(orgId, eventId).doc(c.recordId))
  return adminDb.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r)))
    const currents = snaps.map((s) => (s.exists ? (s.data() as CustodyCheckinRecord) : null))

    // Every referenced action must still be the latest entry on its record.
    // `action === 'undo'` can never be a valid target (undo refs only come from
    // check-in/out results), so it is rejected rather than replayed.
    const stale = changes.some((c, i) => {
      const last = currents[i]?.history?.[currents[i]!.history!.length - 1]
      return !last || last.id !== c.entryId || last.action === 'undo'
    })
    if (stale) return { ok: false as const, reason: 'stale' as const, records: currents }

    const records = changes.map((c, i) => {
      const current = currents[i] as CustodyCheckinRecord
      const history = current.history as CheckinHistoryEntry[]
      const restoredState = replayCustodyState(effectiveEntries(history.slice(0, -1)))
      if (restoredState === null) {
        // The undone action created this record fresh — remove it entirely.
        tx.delete(refs[i])
        return null
      }
      const restored: CustodyCheckinRecord = {
        id: current.id,
        date: current.date,
        member_id: current.member_id,
        family_id: current.family_id,
        member_name: current.member_name,
        ...(current.checked_in_by ? { checked_in_by: current.checked_in_by } : {}),
        status: restoredState.status,
        checked_in_at: restoredState.checked_in_at,
        // The original arrival is preserved forever, even through an undo.
        first_checked_in_at: current.first_checked_in_at ?? restoredState.first_checked_in_at,
        ...(restoredState.checked_out_at ? { checked_out_at: restoredState.checked_out_at } : {}),
        ...(restoredState.guardian_pickup_name
          ? { guardian_pickup_name: restoredState.guardian_pickup_name }
          : {}),
        ...(restoredState.guardian_flag ? { guardian_flag: restoredState.guardian_flag } : {}),
        history: [...history, { id: randomUUID(), action: 'undo' as const, at: now }],
      }
      tx.set(refs[i], restored)
      return restored
    })
    return { ok: true as const, records }
  })
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
