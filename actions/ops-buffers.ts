'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { MAX_BUFFER_MINUTES } from '@/lib/event-ui'
import type { Org } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// Types (Org) are imported from '@/lib/types', never re-exported here:
// re-exporting a type from a 'use server' module breaks `next build` (the RSC
// compiler). See actions/capacity-config.ts for the same note. That constraint
// is also why MAX_BUFFER_MINUTES lives in lib/event-ui (shared with the
// settings client) instead of being exported from here.

const BUFFER_KEYS = ['pack_minutes', 'drive_minutes'] as const

/**
 * Persist the org-default pack/drive buffers behind the back-planned
 * "Pack by / Leave by" chips on job briefs and run sheets. Org-admin only.
 * Mirrors `updateServiceableDays`: an `orgs/{orgId}` `.update()` that replaces
 * the whole `ops_buffers` scalar, so only the keys the caller supplies are
 * stored — an absent field is CLEARED and falls back to the lib/event-ui
 * constants (45m pack / 30m drive). Callers must always send the full merged
 * object, never a single-field patch.
 */
export async function updateOpsBuffers(
  orgId: string,
  cfg: NonNullable<Org['ops_buffers']>,
): Promise<void> {
  await assertOrgAdmin(orgId)

  const ops_buffers: NonNullable<Org['ops_buffers']> = {}

  for (const key of BUFFER_KEYS) {
    const minutes = cfg[key]
    if (minutes === undefined) continue
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_BUFFER_MINUTES) {
      throw new Error(
        `${key === 'pack_minutes' ? 'Pack' : 'Drive'} time must be a whole number of minutes between 1 and ${MAX_BUFFER_MINUTES}`,
      )
    }
    ops_buffers[key] = minutes
  }

  await adminDb.collection('orgs').doc(orgId).update({ ops_buffers })
}

/**
 * Persist the org's IANA timezone (inc-3 S1.1) — the field that makes
 * "18:00 org-local" computable for the cron AND turns the labeled-UTC stamps
 * (guardian email, confirm-ready, print freshness) org-local. Org-admin only.
 * `null`/'' CLEARS the field (surfaces fall back to labeled UTC; the cron
 * skips the org — documented behavior). Validation is by construction: a zone
 * is valid iff Intl can construct a formatter for it — the same check every
 * render site's fallback relies on, so a value that saves here can never
 * render as a fallback.
 */
export async function updateOrgTimezone(orgId: string, timezone: string | null): Promise<void> {
  await assertOrgAdmin(orgId)

  const trimmed = timezone?.trim() ?? ''
  if (!trimmed) {
    await adminDb.collection('orgs').doc(orgId).update({ timezone: FieldValue.delete() })
    return
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed })
  } catch {
    throw new Error(`Unknown time zone: ${trimmed}`)
  }
  await adminDb.collection('orgs').doc(orgId).update({ timezone: trimmed })
}

/**
 * Org-level opt-out for the evening-before run-sheet email (inc-3 S1.3).
 * Dot-path update so the liveness stamps under ops_notifications survive.
 * Org-admin only.
 */
export async function updateEveningRunSheetOptOut(orgId: string, optOut: boolean): Promise<void> {
  await assertOrgAdmin(orgId)
  if (typeof optOut !== 'boolean') throw new Error('optOut must be a boolean')
  await adminDb.collection('orgs').doc(orgId).update({
    'ops_notifications.evening_run_sheet_opt_out': optOut,
  })
}
