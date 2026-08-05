'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import type { Task } from '@/lib/types'

function tasksRef(orgId: string, leadId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId).collection('tasks')
}

export interface CreateTaskInput {
  title: string
  due_date?: string
}

export async function createTask(orgId: string, leadId: string, input: CreateTaskInput): Promise<Task> {
  await assertOrgAdmin(orgId)
  if (!input.title?.trim()) throw new Error('Title is required')
  const id = randomBytes(8).toString('hex')
  const task: Task = {
    id,
    lead_id: leadId,
    title: input.title.trim(),
    done: false,
    created_at: new Date().toISOString(),
    ...(input.due_date ? { due_date: input.due_date } : {}),
  }
  await tasksRef(orgId, leadId).doc(id).set(task)
  return task
}

export async function listTasks(orgId: string, leadId: string): Promise<Task[]> {
  await assertOrgMember(orgId)
  const snap = await tasksRef(orgId, leadId).orderBy('created_at').get()
  return snap.docs.map((d) => d.data() as Task)
}

export async function completeTask(orgId: string, leadId: string, taskId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await tasksRef(orgId, leadId).doc(taskId).update({ done: true, done_at: new Date().toISOString() })
}

export async function deleteTask(orgId: string, leadId: string, taskId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await tasksRef(orgId, leadId).doc(taskId).delete()
}
