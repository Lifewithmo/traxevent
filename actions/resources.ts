'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listResourcesCore, createResourceCore, updateResourceCore, deleteResourceCore,
  type CreateResourceInput, type ResourceUpdate,
} from '@/lib/ops/resources'
import type { OpsResource } from '@/lib/types'

export async function listResources(orgId: string): Promise<OpsResource[]> {
  await assertOrgMember(orgId)
  return listResourcesCore(orgId)
}

export async function createResource(orgId: string, input: CreateResourceInput): Promise<OpsResource> {
  await assertOrgAdmin(orgId)
  return createResourceCore(orgId, input)
}

export async function updateResource(orgId: string, resourceId: string, updates: ResourceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateResourceCore(orgId, resourceId, updates)
}

export async function deleteResource(orgId: string, resourceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return deleteResourceCore(orgId, resourceId)
}
