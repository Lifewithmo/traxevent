import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { ConversionBridge, Dimension, OpsResource, ResourceKind } from '@/lib/types'
import { resolveDimension, validateBridges } from '@/lib/ops/units'

const RESOURCE_KINDS: ResourceKind[] = ['consumable', 'reusable', 'serialized']

export interface CreateResourceInput {
  name: string
  kind: ResourceKind
  unit?: string
  unit_cost?: number
  dimension?: Dimension
  conversions?: ConversionBridge[]
  notes?: string
}

export interface ResourceUpdate {
  name?: string
  kind?: ResourceKind
  unit?: string | null
  unit_cost?: number | null
  dimension?: Dimension | null
  conversions?: ConversionBridge[] | null
  notes?: string | null
}

export function resourcesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('resources')
}

export async function listResourcesCore(orgId: string): Promise<OpsResource[]> {
  const snap = await resourcesRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => {
    const r = d.data() as OpsResource
    return r.dimension ? r : { ...r, dimension: resolveDimension(r) }
  })
}

/** Guard-free create. Validates name + kind; performs no auth. */
export async function createResourceCore(orgId: string, input: CreateResourceInput): Promise<OpsResource> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!RESOURCE_KINDS.includes(input.kind)) throw new Error('Invalid resource kind')
  if (input.conversions) validateBridges(input.conversions)
  const ref = resourcesRef(orgId).doc()
  const resource: OpsResource = {
    id: ref.id,
    name: input.name.trim(),
    kind: input.kind,
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.unit_cost !== undefined ? { unit_cost: input.unit_cost } : {}),
    dimension: input.dimension ?? resolveDimension(input),
    ...(input.conversions !== undefined ? { conversions: input.conversions } : {}),
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
  if (updates.conversions) validateBridges(updates.conversions)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  if (updates.unit !== undefined && updates.dimension === undefined) {
    cleaned.dimension = resolveDimension({ unit: updates.unit ?? undefined })
  }
  await resourcesRef(orgId).doc(resourceId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteResourceCore(orgId: string, resourceId: string): Promise<void> {
  await resourcesRef(orgId).doc(resourceId).delete()
}
