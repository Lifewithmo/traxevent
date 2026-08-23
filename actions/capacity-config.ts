'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { assertValidBlockout } from '@/lib/capacity/units'
import type { Org } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// Types (Org, CapacityBlockout) are imported from '@/lib/types', never
// re-exported here: re-exporting a type from a 'use server' module breaks
// `next build` (the RSC compiler). See actions/capacity.ts for the same note.

const CAPACITY_KINDS = ['mobile', 'venue'] as const

/**
 * Persist which days the business actually works — the weekly pattern plus
 * closure ranges that power the capacity outlook forecast. Org-admin only.
 * Mirrors how `ai_voice_note` / `default_proposal_terms` are written: an
 * `orgs/{orgId}` `.update()` of a single scalar. Only the keys the caller
 * supplies are stored, so an absent `weekdays`/`closures` stays absent
 * (⇒ the engine's all-serviceable default).
 */
export async function updateServiceableDays(
  orgId: string,
  cfg: NonNullable<Org['serviceable_days']>,
): Promise<void> {
  await assertOrgAdmin(orgId)

  const serviceable_days: NonNullable<Org['serviceable_days']> = {}

  if (cfg.weekdays !== undefined) {
    if (!Array.isArray(cfg.weekdays)) throw new Error('weekdays must be an array')
    for (const d of cfg.weekdays) {
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        throw new Error('weekday must be an integer 0..6')
      }
    }
    serviceable_days.weekdays = cfg.weekdays
  }

  if (cfg.closures !== undefined) {
    if (!Array.isArray(cfg.closures)) throw new Error('closures must be an array')
    cfg.closures.forEach(assertValidBlockout)
    serviceable_days.closures = cfg.closures
  }

  await adminDb.collection('orgs').doc(orgId).update({ serviceable_days })
}

/**
 * Persist the operator's vocabulary for the two capacity kinds (BrewTrax →
 * "Cart" / "Room"). Org-admin only. Each supplied kind needs a non-empty
 * singular AND plural; strings are trimmed before storage. Absent kinds fall
 * back to `kindLabel`'s neutral defaults, so they're simply omitted.
 */
export async function updateResourceLabels(
  orgId: string,
  labels: NonNullable<Org['resource_labels']>,
): Promise<void> {
  await assertOrgAdmin(orgId)

  const resource_labels: NonNullable<Org['resource_labels']> = {}

  for (const kind of CAPACITY_KINDS) {
    const label = labels[kind]
    if (label === undefined) continue
    const one = typeof label.one === 'string' ? label.one.trim() : ''
    const many = typeof label.many === 'string' ? label.many.trim() : ''
    if (!one || !many) throw new Error('A resource label needs both a singular and a plural word')
    resource_labels[kind] = { one, many }
  }

  await adminDb.collection('orgs').doc(orgId).update({ resource_labels })
}
