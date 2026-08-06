'use server'

import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { logActivity } from '@/lib/activity'
import { tasksRef, listTasksCore } from '@/lib/crm/tasks'
import type { Task } from '@/lib/types'

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
  return listTasksCore(orgId, leadId)
}

export async function completeTask(orgId: string, leadId: string, taskId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const snap = await tasksRef(orgId, leadId).doc(taskId).get()
  const title = snap.exists ? (snap.data() as Task).title : undefined
  await tasksRef(orgId, leadId).doc(taskId).update({ done: true, done_at: new Date().toISOString() })
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'task',
    summary: `Completed: ${title ?? 'task'}`,
  })
}

export async function snoozeTask(
  orgId: string,
  leadId: string,
  taskId: string,
  dueDate: string
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!dueDate?.trim()) throw new Error('A due date is required to snooze')
  const snap = await tasksRef(orgId, leadId).doc(taskId).get()
  const title = snap.exists ? (snap.data() as Task).title : undefined
  await tasksRef(orgId, leadId).doc(taskId).update({ due_date: dueDate.trim() })
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'task',
    summary: `Snoozed: ${title ?? 'task'} → ${dueDate.trim()}`,
  })
}

export async function deleteTask(orgId: string, leadId: string, taskId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await tasksRef(orgId, leadId).doc(taskId).delete()
}
