'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listCapacityUnitsCore,
  createCapacityUnitCore,
  updateCapacityUnitCore,
  deleteCapacityUnitCore,
} from '@/lib/capacity/units'
import type { CapacityUnit, CapacityUnitKind } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// Types (CapacityUnit, CapacityUnitKind, CapacityBlockout) are imported from
// '@/lib/types', never re-exported here — re-exporting a type from a 'use server'
// module breaks `next build` (the RSC compiler).

export async function listCapacityUnits(orgId: string): Promise<CapacityUnit[]> {
  await assertOrgMember(orgId)
  return listCapacityUnitsCore(orgId)
}

export async function createCapacityUnit(
  orgId: string,
  input: { name: string; kind: CapacityUnitKind },
): Promise<CapacityUnit> {
  await assertOrgAdmin(orgId)
  return createCapacityUnitCore(orgId, input)
}

export async function updateCapacityUnit(
  orgId: string,
  id: string,
  updates: Partial<Pick<CapacityUnit, 'name' | 'active' | 'blockouts'>>,
): Promise<void> {
  await assertOrgAdmin(orgId)
  await updateCapacityUnitCore(orgId, id, updates)
}

export async function deleteCapacityUnit(orgId: string, id: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await deleteCapacityUnitCore(orgId, id)
}
