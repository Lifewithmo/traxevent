'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Department } from '@/lib/types'
import { randomBytes } from 'crypto'

function deptsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('departments')
}

export async function listDepartments(orgId: string): Promise<Department[]> {
  const snap = await deptsRef(orgId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as Department)
}

export interface CreateDepartmentInput {
  name: string
  description?: string
}

export async function createDepartment(orgId: string, input: CreateDepartmentInput): Promise<Department> {
  const id = randomBytes(8).toString('hex')
  const dept: Department = {
    id,
    name: input.name,
    ...(input.description && input.description.trim() ? { description: input.description.trim() } : {}),
    created_at: new Date().toISOString(),
  }
  await deptsRef(orgId).doc(id).set(dept)
  return dept
}

export async function updateDepartment(
  orgId: string,
  deptId: string,
  updates: { name?: string; description?: string | null }
): Promise<void> {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await deptsRef(orgId).doc(deptId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteDepartment(orgId: string, deptId: string): Promise<void> {
  // Unassign any camps in this department before deleting it.
  const campsSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .where('department_id', '==', deptId)
    .get()
  if (!campsSnap.empty) {
    const batch = adminDb.batch()
    for (const doc of campsSnap.docs) {
      batch.update(doc.ref, { department_id: FieldValue.delete() })
    }
    await batch.commit()
  }
  await deptsRef(orgId).doc(deptId).delete()
}
