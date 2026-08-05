import { describe, it, expect, vi, beforeEach } from 'vitest'

const taskDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({ id: 't1', title: 'Some title', done: false, lead_id: 'l1', created_at: '' }),
  }),
}))
const getTasksSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              doc: vi.fn().mockReturnValue(taskDocSpy),
              orderBy: vi.fn().mockReturnValue({ get: getTasksSpy }),
            }),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

import { createTask, listTasks, completeTask, deleteTask, snoozeTask } from '@/actions/tasks'

describe('createTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a title', async () => {
    await expect(createTask('o1', 'l1', { title: '  ' })).rejects.toThrow('Title is required')
  })

  it('creates a task with an id, done:false, and a timestamp', async () => {
    const task = await createTask('o1', 'l1', { title: 'Call client', due_date: '2026-02-01' })
    expect(task.id).toBeTruthy()
    expect(task.created_at).toBeTruthy()
    expect(task.done).toBe(false)
    expect(taskDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call client', done: false, due_date: '2026-02-01' })
    )
  })

  it('omits due_date when not provided', async () => {
    await createTask('o1', 'l1', { title: 'Follow up' })
    const stored = taskDocSpy.set.mock.calls[0][0]
    expect(stored).not.toHaveProperty('due_date')
  })
})

describe('listTasks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all tasks for a lead', async () => {
    getTasksSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 't1', lead_id: 'l1', title: 'Call client', done: false, created_at: 'x' }) }],
    })
    const tasks = await listTasks('o1', 'l1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Call client')
  })
})

describe('completeTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks the task done with a done_at timestamp', async () => {
    await completeTask('o1', 'l1', 't1')
    expect(taskDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ done: true, done_at: expect.any(String) })
    )
  })
})

describe('deleteTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the task document', async () => {
    await deleteTask('o1', 'l1', 't1')
    expect(taskDocSpy.delete).toHaveBeenCalled()
  })
})

describe('snoozeTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the due_date', async () => {
    await snoozeTask('o1', 'l1', 't1', '2026-08-08')
    expect(taskDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: '2026-08-08' })
    )
  })

  it('rejects a blank date', async () => {
    await expect(snoozeTask('o1', 'l1', 't1', '  ')).rejects.toThrow('due date')
  })
})
