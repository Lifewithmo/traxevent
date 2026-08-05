import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { WorkPackage, WorkPackageLine } from '@/lib/types'

export interface CreateWorkPackageInput {
  name: string
  description?: string
  scope?: string
  price: number
  max_guests?: number
  lines: WorkPackageLine[]
  setup_minutes?: number
  teardown_minutes?: number
  checklist_template_ids?: string[]
}

export interface WorkPackageUpdate {
  name?: string
  description?: string | null
  scope?: string | null
  price?: number
  max_guests?: number | null
  lines?: WorkPackageLine[]
  setup_minutes?: number | null
  teardown_minutes?: number | null
  checklist_template_ids?: string[] | null
}

export function workPackagesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('work_packages')
}

function validateLines(lines: WorkPackageLine[], validResourceIds: Set<string>): void {
  for (const line of lines) {
    if (line.kind === 'labor') {
      if (line.count <= 0) throw new Error('Quantities must be positive')
      continue
    }
    if (!validResourceIds.has(line.resource_id)) throw new Error(`Unknown resource: ${line.resource_id}`)
    const qty = line.kind === 'consumable' ? line.qty_per_guest : line.qty
    if (qty <= 0) throw new Error('Quantities must be positive')
  }
}

/** Sanitize line objects: strip undefined keys to prevent Firestore undefined rejection. */
function sanitizeLines(lines: WorkPackageLine[]): WorkPackageLine[] {
  return lines.map((line) => Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined))) as WorkPackageLine[]
}

export async function listWorkPackagesCore(orgId: string): Promise<WorkPackage[]> {
  const snap = await workPackagesRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as WorkPackage)
}

export async function getWorkPackagesByIdsCore(orgId: string, ids: string[]): Promise<WorkPackage[]> {
  const docs = await Promise.all(ids.map((id) => workPackagesRef(orgId).doc(id).get()))
  return docs.filter((d) => d.exists).map((d) => d.data() as WorkPackage)
}

/** Guard-free create. Validates name/price/lines; performs no auth. */
export async function createWorkPackageCore(
  orgId: string,
  input: CreateWorkPackageInput,
  validResourceIds: Set<string>,
): Promise<WorkPackage> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (input.price < 0) throw new Error('Price must be zero or more')
  validateLines(input.lines, validResourceIds)
  const ref = workPackagesRef(orgId).doc()
  const wp: WorkPackage = {
    id: ref.id,
    name: input.name.trim(),
    price: input.price,
    lines: sanitizeLines(input.lines),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.max_guests !== undefined ? { max_guests: input.max_guests } : {}),
    ...(input.setup_minutes !== undefined ? { setup_minutes: input.setup_minutes } : {}),
    ...(input.teardown_minutes !== undefined ? { teardown_minutes: input.teardown_minutes } : {}),
    ...(input.checklist_template_ids !== undefined ? { checklist_template_ids: input.checklist_template_ids } : {}),
    created_at: new Date().toISOString(),
  }
  await ref.set(wp)
  return wp
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateWorkPackageCore(
  orgId: string,
  packageId: string,
  updates: WorkPackageUpdate,
  validResourceIds: Set<string>,
): Promise<void> {
  if (updates.price !== undefined && updates.price < 0) throw new Error('Price must be zero or more')
  if (updates.lines) validateLines(updates.lines, validResourceIds)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    if (k === 'lines' && v !== null) {
      cleaned[k] = sanitizeLines(v as WorkPackageLine[])
    } else {
      cleaned[k] = v === null ? FieldValue.delete() : v
    }
  }
  await workPackagesRef(orgId).doc(packageId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteWorkPackageCore(orgId: string, packageId: string): Promise<void> {
  await workPackagesRef(orgId).doc(packageId).delete()
}
