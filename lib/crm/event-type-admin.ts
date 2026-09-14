import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { leadsRef } from '@/lib/crm/leads'
import type { EventTypeProfile, Lead, Org } from '@/lib/types'

/*
 * Event-type lifecycle cores (event types inc 1, spec §4) — guard-free, like
 * lib/capacity/units.ts's *Core functions: no auth here; the thin admin-guarded
 * wrappers live in actions/event-type-profiles.ts. Every mutation rewrites the
 * whole `orgs/{orgId}.event_type_profiles` array (the existing
 * whole-array-replace contract of actions/capacity-config.ts), and the lead
 * backfills batch at ≤500 writes per WriteBatch, the departments-delete way.
 */

const BATCH_LIMIT = 500

const newId = () => randomBytes(8).toString('hex')

const norm = (s: string) => s.trim().toLowerCase()

function orgRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId)
}

async function loadProfiles(orgId: string): Promise<EventTypeProfile[]> {
  const snap = await orgRef(orgId).get()
  if (!snap.exists) throw new Error('Org not found')
  return (snap.data() as Org).event_type_profiles ?? []
}

/** Known-field hygiene on the way back to Firestore (matching
 *  updateEventTypeProfiles): id first when present, `archived` only when true —
 *  a restored entry sheds the flag instead of carrying `archived: false`. */
function cleanEntry(p: EventTypeProfile): EventTypeProfile {
  return {
    ...(p.id ? { id: p.id } : {}),
    name: p.name,
    needsMobile: p.needsMobile,
    needsVenue: p.needsVenue,
    ...(p.archived ? { archived: true } : {}),
  }
}

async function writeProfiles(orgId: string, profiles: EventTypeProfile[]): Promise<void> {
  await orgRef(orgId).update({ event_type_profiles: profiles.map(cleanEntry) })
}

/** The id-bearing profiles a lead's `event_type_id` could actually resolve to —
 *  the set every backfill checks ids against, so "has an id" only protects a
 *  lead when the id is real. */
function knownProfileIds(profiles: EventTypeProfile[]): ReadonlySet<string> {
  return new Set(profiles.map((p) => p.id).filter((x): x is string => Boolean(x)))
}

/** The BACKFILL match rule (spec §4 rename/merge): a lead belongs to the
 *  profile when it references it by id; a lead pointing at a DIFFERENT known
 *  profile is never re-routed by name; and a lead with no id — or a DANGLING
 *  id resolving to no profile, exactly as `resolveLeadProfile` and
 *  leadRequirement treat one — matches on its free-text name (trim +
 *  lowercase). Without the dangling-id fallback a lead could COUNT toward a
 *  profile's usage yet be skipped by that profile's backfills. */
function matchesForBackfill(
  lead: Pick<Lead, 'event_type' | 'event_type_id'>,
  id: string,
  nameKey: string,
  knownIds: ReadonlySet<string>
): boolean {
  if (lead.event_type_id) {
    if (lead.event_type_id === id) return true
    if (knownIds.has(lead.event_type_id)) return false
  }
  const key = lead.event_type ? norm(lead.event_type) : ''
  return key !== '' && key === nameKey
}

/** Commit `patch` to every ref, ≤500 writes per batch. Returns the count. */
async function batchLeadUpdates(
  refs: FirebaseFirestore.DocumentReference[],
  patch: Record<string, unknown>
): Promise<number> {
  let batch = adminDb.batch()
  let inBatch = 0
  for (const ref of refs) {
    batch.update(ref, patch)
    inBatch += 1
    if (inBatch === BATCH_LIMIT) {
      await batch.commit()
      batch = adminDb.batch()
      inBatch = 0
    }
  }
  if (inBatch > 0) await batch.commit()
  return refs.length
}

/** Which profile a lead counts toward — MIRRORS leadRequirement's resolution
 *  (lib/capacity/requirement.ts): id first (archived included), then name
 *  match with last-wins-on-dupes, so usage numbers always agree with the
 *  policy the lead actually gets. Pure. */
function resolveLeadProfile(
  lead: Pick<Lead, 'event_type' | 'event_type_id'>,
  profiles: EventTypeProfile[]
): EventTypeProfile | undefined {
  if (lead.event_type_id) {
    const byId = profiles.find((p) => p.id === lead.event_type_id)
    if (byId) return byId
  }
  const key = lead.event_type ? norm(lead.event_type) : ''
  if (!key) return undefined
  let matched: EventTypeProfile | undefined
  for (const p of profiles) {
    if (norm(p.name) === key) matched = p // last match wins, like leadRequirement
  }
  return matched
}

export interface EventTypeUsage {
  /** Lead count per profile id — every id-bearing profile is present, 0 included. */
  byProfileId: Record<string, number>
  /** Free-text types matching NO profile, grouped trim+lowercase: display name =
   *  the group's most frequent original spelling (first seen wins ties), sorted
   *  by count desc. `onsiteMajority` = a strict majority are delivery_mode
   *  'onsite' — the adopt flow's `needsVenue` prefill signal. */
  unadopted: Array<{ name: string; count: number; onsiteMajority: boolean }>
}

/**
 * PURE usage rollup for the settings page and the destructive dialogs: how many
 * leads each profile owns (id-referenced leads count to their profile even
 * after a rename), and which historical names are still unadopted. Leads with
 * no resolvable profile and a blank type are ignored. A legacy profile entry
 * without an id cannot be keyed and is skipped in `byProfileId` (it gains an id
 * on the next settings save).
 */
export function computeEventTypeUsage(
  leads: Lead[],
  profiles: EventTypeProfile[]
): EventTypeUsage {
  const byProfileId: Record<string, number> = {}
  for (const p of profiles) {
    if (p.id) byProfileId[p.id] = 0
  }

  const groups = new Map<string, { count: number; onsite: number; spellings: Map<string, number> }>()
  for (const lead of leads) {
    const resolved = resolveLeadProfile(lead, profiles)
    if (resolved) {
      if (resolved.id) byProfileId[resolved.id] = (byProfileId[resolved.id] ?? 0) + 1
      continue
    }
    const display = lead.event_type?.trim() ?? ''
    if (display === '') continue
    const key = display.toLowerCase()
    let g = groups.get(key)
    if (!g) {
      g = { count: 0, onsite: 0, spellings: new Map() }
      groups.set(key, g)
    }
    g.count += 1
    if (lead.delivery_mode === 'onsite') g.onsite += 1
    g.spellings.set(display, (g.spellings.get(display) ?? 0) + 1)
  }

  const unadopted = [...groups.values()]
    .map((g) => {
      let name = ''
      let best = -1
      for (const [spelling, count] of g.spellings) {
        if (count > best) {
          name = spelling
          best = count
        }
      }
      return { name, count: g.count, onsiteMajority: g.onsite * 2 > g.count }
    })
    .sort((a, b) => b.count - a.count) // stable ⇒ ties keep first-seen order

  return { byProfileId, unadopted }
}

export interface CreateEventTypeProfileInput {
  name: string
  needsMobile: boolean
  needsVenue: boolean
}

/**
 * Guard-free create — idempotent on name: a case-insensitive match returns the
 * EXISTING profile (its configured casing and policy, never the caller's),
 * reviving it if archived and assigning an id if it is a legacy id-less entry.
 * Only writes when something actually changed.
 */
export async function createEventTypeProfileCore(
  orgId: string,
  input: CreateEventTypeProfileInput
): Promise<EventTypeProfile> {
  const name = input.name?.trim()
  if (!name) throw new Error('An event type needs a name')
  const profiles = await loadProfiles(orgId)
  const key = norm(name)

  // Last match wins on (legacy-only) duplicate names, consistent with
  // leadRequirement — the entry returned is the one whose policy leads get.
  let idx = -1
  for (let i = 0; i < profiles.length; i += 1) {
    if (norm(profiles[i].name) === key) idx = i
  }

  if (idx >= 0) {
    const existing = profiles[idx]
    const revived: EventTypeProfile = {
      id: existing.id ?? newId(),
      name: existing.name,
      needsMobile: existing.needsMobile,
      needsVenue: existing.needsVenue,
    }
    if (!existing.id || existing.archived) {
      const next = [...profiles]
      next[idx] = revived
      await writeProfiles(orgId, next)
    }
    return revived
  }

  const created: EventTypeProfile = {
    id: newId(),
    name,
    needsMobile: Boolean(input.needsMobile),
    needsVenue: Boolean(input.needsVenue),
  }
  await writeProfiles(orgId, [...profiles, created])
  return created
}

/**
 * Guard-free rename-with-backfill (spec §4): rewrites every lead with
 * `event_type_id === id` OR (no resolvable id + name-matching the OLD name)
 * to `{event_type_id, event_type: newName}`, THEN renames the entry — so a
 * rename propagates to all history and every engine instead of silently
 * reverting it to the default rule. Leads move FIRST, mirroring
 * `mergeEventTypeProfilesCore`: id-first matching keeps every intermediate
 * state correct (a backfilled lead resolves to this profile by id under
 * either name), and a failed backfill leaves the entry un-renamed so a retry
 * still computes the OLD name key and converges. The reverse order stranded
 * old-name leads on the default rule when the backfill died mid-way, and
 * retries were no-ops. Renaming onto another profile's name is refused (that
 * is a merge).
 */
export async function renameEventTypeProfileCore(
  orgId: string,
  id: string,
  newName: string
): Promise<{ updated: number }> {
  const name = newName?.trim()
  if (!name) throw new Error('An event type needs a name')
  const profiles = await loadProfiles(orgId)
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error('Event type not found')
  const nameKey = norm(name)
  if (profiles.some((p, i) => i !== idx && norm(p.name) === nameKey)) {
    throw new Error('An event type with that name already exists — merge instead')
  }
  const oldKey = norm(profiles[idx].name)
  const knownIds = knownProfileIds(profiles)

  const snap = await leadsRef(orgId).get()
  const targets = snap.docs.filter((d) => matchesForBackfill(d.data() as Lead, id, oldKey, knownIds))
  const updated = await batchLeadUpdates(
    targets.map((d) => d.ref),
    { event_type_id: id, event_type: name }
  )

  const next = [...profiles]
  next[idx] = { ...profiles[idx], name }
  await writeProfiles(orgId, next)
  return { updated }
}

/**
 * Guard-free merge A→B (spec §4): every lead referencing `fromId` (by id, or
 * unadopted by name) is re-pointed to `{event_type_id: intoId, event_type:
 * into.name}`, then the `from` entry is removed. Leads move FIRST so a failure
 * midway leaves both entries standing (harmless, re-runnable) rather than
 * stranding id-referenced history on a deleted entry. Irreversible.
 */
export async function mergeEventTypeProfilesCore(
  orgId: string,
  fromId: string,
  intoId: string
): Promise<{ updated: number }> {
  if (fromId === intoId) throw new Error('Cannot merge an event type into itself')
  const profiles = await loadProfiles(orgId)
  const from = profiles.find((p) => p.id === fromId)
  const into = profiles.find((p) => p.id === intoId)
  if (!from || !into) throw new Error('Event type not found')

  const snap = await leadsRef(orgId).get()
  const fromKey = norm(from.name)
  const knownIds = knownProfileIds(profiles)
  const targets = snap.docs.filter((d) => matchesForBackfill(d.data() as Lead, fromId, fromKey, knownIds))
  const updated = await batchLeadUpdates(
    targets.map((d) => d.ref),
    { event_type_id: intoId, event_type: into.name }
  )

  await writeProfiles(orgId, profiles.filter((p) => p.id !== fromId))
  return { updated }
}

/**
 * Guard-free delete — allowed only at SERVER-verified zero usage (Stripe/QBO
 * rule). Usage resolution mirrors `computeEventTypeUsage` (id first, stale ids
 * fall back to name), so this verdict always agrees with the count the settings
 * page showed. Refusal is a RETURN VALUE, not a throw (house style,
 * lib/capacity/guard.ts rationale: Next redacts thrown Server Action errors in
 * production, so a thrown guard degrades into an undetectable hard block).
 */
export async function deleteEventTypeProfileCore(
  orgId: string,
  id: string
): Promise<{ ok: true } | { ok: false; usage: number }> {
  const profiles = await loadProfiles(orgId)
  const target = profiles.find((p) => p.id === id)
  if (!target) throw new Error('Event type not found')

  const snap = await leadsRef(orgId).get()
  let usage = 0
  for (const d of snap.docs) {
    if (resolveLeadProfile(d.data() as Lead, profiles)?.id === id) usage += 1
  }
  if (usage > 0) return { ok: false, usage }

  await writeProfiles(orgId, profiles.filter((p) => p.id !== id))
  return { ok: true }
}

/** Guard-free archive/restore. Archived types vanish from every picker but keep
 *  matching in `leadRequirement`, so booked history keeps its capacity policy. */
export async function setEventTypeProfileArchivedCore(
  orgId: string,
  id: string,
  archived: boolean
): Promise<void> {
  const profiles = await loadProfiles(orgId)
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error('Event type not found')
  const next = [...profiles]
  next[idx] = { ...profiles[idx], archived }
  await writeProfiles(orgId, next)
}

export interface AdoptEventTypeEntry {
  name: string
  needsMobile: boolean
  needsVenue: boolean
}

/**
 * Guard-free adopt-from-history (spec §5a): create-or-match each entry (a match
 * reuses the existing profile — reviving it and lazily assigning a missing id —
 * and NEVER overwrites its configured policy), then backfill `event_type_id`
 * onto every id-less lead whose free-text type exactly matches (trim +
 * lowercase). The backfill stamps the id ONLY: a lead's own spelling is a
 * record — adopt classifies history, it does not rewrite it. Idempotent:
 * `created` counts new entries, `adopted` counts lead docs stamped.
 */
export async function adoptEventTypesFromHistoryCore(
  orgId: string,
  entries: AdoptEventTypeEntry[]
): Promise<{ created: number; adopted: number }> {
  const profiles = await loadProfiles(orgId)
  const next = [...profiles]
  let created = 0
  let profilesChanged = false
  const idByKey = new Map<string, string>()

  for (const entry of entries) {
    const name = entry.name?.trim()
    if (!name) throw new Error('An event type needs a name')
    const key = norm(name)
    if (idByKey.has(key)) continue // duplicate entry in the request

    let idx = -1
    for (let i = 0; i < next.length; i += 1) {
      if (norm(next[i].name) === key) idx = i
    }
    if (idx >= 0) {
      const existing = next[idx]
      const revived: EventTypeProfile = {
        id: existing.id ?? newId(),
        name: existing.name,
        needsMobile: existing.needsMobile,
        needsVenue: existing.needsVenue,
      }
      if (!existing.id || existing.archived) {
        next[idx] = revived
        profilesChanged = true
      }
      idByKey.set(key, revived.id!)
    } else {
      const profile: EventTypeProfile = {
        id: newId(),
        name,
        needsMobile: Boolean(entry.needsMobile),
        needsVenue: Boolean(entry.needsVenue),
      }
      next.push(profile)
      created += 1
      profilesChanged = true
      idByKey.set(key, profile.id!)
    }
  }

  if (profilesChanged) await writeProfiles(orgId, next)

  const snap = await leadsRef(orgId).get()
  const knownIds = knownProfileIds(next)
  let adopted = 0
  let batch = adminDb.batch()
  let inBatch = 0
  for (const d of snap.docs) {
    const lead = d.data() as Lead
    // Same dangling-id rule as matchesForBackfill: only an id that resolves
    // to a real profile protects a lead from adoption. A dangling one already
    // falls back to name in usage/leadRequirement, so adopt must claim it —
    // or the unadopted count and the stamped count disagree.
    if (lead.event_type_id && knownIds.has(lead.event_type_id)) continue
    const key = lead.event_type ? norm(lead.event_type) : ''
    if (!key) continue
    const id = idByKey.get(key)
    if (!id) continue
    batch.update(d.ref, { event_type_id: id })
    adopted += 1
    inBatch += 1
    if (inBatch === BATCH_LIMIT) {
      await batch.commit()
      batch = adminDb.batch()
      inBatch = 0
    }
  }
  if (inBatch > 0) await batch.commit()

  return { created, adopted }
}
