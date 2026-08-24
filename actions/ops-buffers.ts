'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import type { Org } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// Types (Org) are imported from '@/lib/types', never re-exported here:
// re-exporting a type from a 'use server' module breaks `next build` (the RSC
// compiler). See actions/capacity-config.ts for the same note.

/** Sanity ceiling: nobody packs or drives for more than 8 hours before a job. */
const MAX_BUFFER_MINUTES = 480

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
