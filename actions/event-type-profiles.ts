'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import {
  createEventTypeProfileCore,
  renameEventTypeProfileCore,
  mergeEventTypeProfilesCore,
  deleteEventTypeProfileCore,
  setEventTypeProfileArchivedCore,
  adoptEventTypesFromHistoryCore,
  type CreateEventTypeProfileInput,
  type AdoptEventTypeEntry,
} from '@/lib/crm/event-type-admin'
import type { EventTypeProfile } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// Types (EventTypeProfile, the input shapes, EventTypeUsage) live in lib and
// are never re-exported here: re-exporting a type from a 'use server' module
// breaks `next build` (RSC compiler). See actions/capacity-config.ts.
//
// Thin admin-guarded wrappers over the guard-free lifecycle cores in
// lib/crm/event-type-admin.ts — the actions/capacity-config ↔
// lib/capacity/units split. Semantics are documented on the cores.

export async function createEventTypeProfile(
  orgId: string,
  input: CreateEventTypeProfileInput
): Promise<EventTypeProfile> {
  await assertOrgAdmin(orgId)
  return createEventTypeProfileCore(orgId, input)
}

export async function renameEventTypeProfile(
  orgId: string,
  id: string,
  newName: string
): Promise<{ updated: number }> {
  await assertOrgAdmin(orgId)
  return renameEventTypeProfileCore(orgId, id, newName)
}

export async function mergeEventTypeProfiles(
  orgId: string,
  fromId: string,
  intoId: string
): Promise<{ updated: number }> {
  await assertOrgAdmin(orgId)
  return mergeEventTypeProfilesCore(orgId, fromId, intoId)
}

export async function deleteEventTypeProfile(
  orgId: string,
  id: string
): Promise<{ ok: true } | { ok: false; usage: number }> {
  await assertOrgAdmin(orgId)
  return deleteEventTypeProfileCore(orgId, id)
}

export async function setEventTypeProfileArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<void> {
  await assertOrgAdmin(orgId)
  return setEventTypeProfileArchivedCore(orgId, id, archived)
}

export async function adoptEventTypesFromHistory(
  orgId: string,
  entries: AdoptEventTypeEntry[]
): Promise<{ created: number; adopted: number }> {
  await assertOrgAdmin(orgId)
  return adoptEventTypesFromHistoryCore(orgId, entries)
}
