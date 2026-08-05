import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { OpsResource, ResourceKind } from '@/lib/types'

const RESOURCE_KINDS: ResourceKind[] = ['consumable', 'reusable', 'serialized']

export interface CreateResourceInput {
  name: string
  kind: ResourceKind
  unit?: string
  unit_cost?: number
  notes?: string
}

export interface ResourceUpdate {
  name?: string
  kind?: ResourceKind
  unit?: string | null
  unit_cost?: number | null
  notes?: string | null
}

export function resourcesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('resources')
}

export async function listResourcesCore(orgId: string): Promise<OpsResource[]> {
  const snap = await resourcesRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as OpsResource)
}

/** Guard-free create. Validates name + kind; performs no auth. */
export async function createResourceCore(orgId: string, input: CreateResourceInput): Promise<OpsResource> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!RESOURCE_KINDS.includes(input.kind)) throw new Error('Invalid resource kind')
  const ref = resourcesRef(orgId).doc()
  const resource: OpsResource = {
    id: ref.id,
    name: input.name.trim(),
    kind: input.kind,
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.unit_cost !== undefined ? { unit_cost: input.unit_cost } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: new Date().toISOString(),
  }
  await ref.set(resource)
  return resource
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateResourceCore(orgId: string, resourceId: string, updates: ResourceUpdate): Promise<void> {
  if (updates.kind !== undefined && !RESOURCE_KINDS.includes(updates.kind)) throw new Error('Invalid resource kind')
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await resourcesRef(orgId).doc(resourceId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteResourceCore(orgId: string, resourceId: string): Promise<void> {
  await resourcesRef(orgId).doc(resourceId).delete()
}
