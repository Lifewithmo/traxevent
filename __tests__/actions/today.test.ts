import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }) }))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) } }))
const listLeadsCore = vi.hoisted(() => vi.fn())
const listTasksCore = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  listLeadsCore,
}))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore, tasksRef: vi.fn() }))
const listEventsCore = vi.hoisted(() => vi.fn())
vi.mock('@/lib/events', () => ({ listEventsCore, eventsRef: vi.fn(), createEventCore: vi.fn(), listEventsByLeadCore: vi.fn() }))

import { getTodayData } from '@/actions/today'

describe('getTodayData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches tasks only for open leads and returns aggregated data', async () => {
    listLeadsCore.mockResolvedValue([
      { id: 'open1', name: 'A', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 200 },
      { id: 'closed1', name: 'B', stage: 'closed_won', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 999 },
    ])
    listTasksCore.mockResolvedValue([]) // open1 has no tasks -> needs attention
    listEventsCore.mockResolvedValue([])
    const data = await getTodayData('o1')
    // listTasksCore called once, for the open lead only
    expect(listTasksCore).toHaveBeenCalledTimes(1)
    expect(listTasksCore).toHaveBeenCalledWith('o1', 'open1')
    expect(data.needsAttention.map((n) => n.leadId)).toEqual(['open1'])
    expect(data.tiles.openPipelineValue).toBe(200)
  })

  it('authorizes once regardless of how many open leads there are', async () => {
    const { assertOrgMember } = await import('@/lib/auth/assert')
    listLeadsCore.mockResolvedValue([
      { id: 'l1', name: 'A', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'l2', name: 'B', stage: 'proposal', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'l3', name: 'C', stage: 'consultation', created_at: '2026-08-01T00:00:00.000Z' },
    ])
    listTasksCore.mockResolvedValue([])
    listEventsCore.mockResolvedValue([])
    await getTodayData('o1')
    expect(assertOrgMember).toHaveBeenCalledTimes(1)
    expect(listTasksCore).toHaveBeenCalledTimes(3)
  })

  it('treats a won lead with a linked event as scheduled, reading events once', async () => {
    listLeadsCore.mockResolvedValue([
      { id: 'w1', name: 'A', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'w2', name: 'B', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
    ])
    listTasksCore.mockResolvedValue([])
    listEventsCore.mockResolvedValue([{ id: 'e1', lead_id: 'w1' }, { id: 'e2' }])
    const data = await getTodayData('o1')
    expect(listEventsCore).toHaveBeenCalledTimes(1)
    expect(data.wonUnscheduled.map((w) => w.leadId)).toEqual(['w2'])
  })
})
