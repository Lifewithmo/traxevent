'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listWorkPackagesCore, createWorkPackageCore, updateWorkPackageCore, deleteWorkPackageCore,
  type CreateWorkPackageInput, type WorkPackageUpdate,
} from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import type { WorkPackage } from '@/lib/types'

async function validResourceIds(orgId: string): Promise<Set<string>> {
  const resources = await listResourcesCore(orgId)
  return new Set(resources.map((r) => r.id))
}

export async function listWorkPackages(orgId: string): Promise<WorkPackage[]> {
  await assertOrgMember(orgId)
  return listWorkPackagesCore(orgId)
}

export async function createWorkPackage(orgId: string, input: CreateWorkPackageInput): Promise<WorkPackage> {
  await assertOrgAdmin(orgId)
  return createWorkPackageCore(orgId, input, await validResourceIds(orgId))
}

export async function updateWorkPackage(orgId: string, packageId: string, updates: WorkPackageUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateWorkPackageCore(orgId, packageId, updates, await validResourceIds(orgId))
}

export async function deleteWorkPackage(orgId: string, packageId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return deleteWorkPackageCore(orgId, packageId)
}
