'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  getOpsPlanCore, instantiateOpsPlanCore, updateOpsRequirementsCore,
  type InstantiateOpsPlanInput,
} from '@/lib/ops/event-ops'
import type { OpsPlan, OpsRequirements } from '@/lib/types'

// NOTE: 'use server' module — InstantiateOpsPlanInput is imported for typing
// this file's exports only and is NOT re-exported; import it from
// '@/lib/ops/event-ops' where it's needed elsewhere (see actions/customers.ts
// for the precedent — re-exporting types from a 'use server' file broke
// `next build`'s RSC compiler).

export async function getOpsPlan(orgId: string, eventId: string): Promise<OpsPlan | null> {
  await assertOrgMember(orgId)
  return getOpsPlanCore(orgId, eventId)
}

export async function instantiateOpsPlan(
  orgId: string,
  eventId: string,
  input: Omit<InstantiateOpsPlanInput, 'actor_uid'>,
): Promise<OpsPlan> {
  const member = await assertOrgAdmin(orgId)
  return instantiateOpsPlanCore(orgId, eventId, { ...input, actor_uid: member.uid })
}

export async function updateOpsRequirements(
  orgId: string,
  eventId: string,
  updates: Partial<OpsRequirements>,
): Promise<void> {
  const member = await assertOrgMember(orgId)
  return updateOpsRequirementsCore(orgId, eventId, updates, member.uid)
}
