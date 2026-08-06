import { adminDb } from '@/lib/firebase-admin'
import type { Task } from '@/lib/types'

export function tasksRef(orgId: string, leadId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId).collection('tasks')
}

/** Guard-free task list. Authorization is the caller's responsibility. */
export async function listTasksCore(orgId: string, leadId: string): Promise<Task[]> {
  const snap = await tasksRef(orgId, leadId).orderBy('created_at').get()
  return snap.docs.map((d) => d.data() as Task)
}
