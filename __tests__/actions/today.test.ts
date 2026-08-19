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
const getOpsPlanCore = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ops/event-ops', () => ({ getOpsPlanCore }))

import { getTodayData, getTodayAgenda } from '@/actions/today'
import { todayYmd, addDays } from '@/lib/opportunity-detail'

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

describe('getTodayAgenda', () => {
  beforeEach(() => vi.clearAllMocks())

  const today = todayYmd()
  const event = (over: Record<string, unknown>) => ({
    name: 'Job', slug: 'job', status: 'active',
    event_start: today, event_end: today, created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  it('reads ops plans only for client jobs inside the today+7 window', async () => {
    listEventsCore.mockResolvedValue([
      event({ id: 'job-today' }),                                                          // client_job (kind absent)
      event({ id: 'market', kind: 'market_day', event_start: addDays(today, 1), event_end: addDays(today, 1) }),
      event({ id: 'far', event_start: addDays(today, 20), event_end: addDays(today, 20) }), // outside the window
      event({ id: 'gone', status: 'archived' }),                                            // not on the agenda
    ])
    getOpsPlanCore.mockResolvedValue({
      package_ids: [], requirements: { guests: 30 },
      deadlines: [], checklists: [], needs_review: false, change_log: [],
      shopping_list: [{ resource_id: 'r1', name: 'Cups', qty: 2, checked: false }],
      packing_list: [], created_at: '2026-01-01T00:00:00.000Z',
    })
    const agenda = await getTodayAgenda('o1')
    expect(getOpsPlanCore).toHaveBeenCalledTimes(1)
    expect(getOpsPlanCore).toHaveBeenCalledWith('o1', 'job-today')
    expect(agenda.today.find((e) => e.eventId === 'job-today')?.ops).toMatchObject({
      hasPlan: true,
      packed: { done: 0, total: 1 },
      readiness: { done: 0, total: 1, overdue: 0 },
    })
    // Market days carry no ops claim at all — no false "not ready".
    expect(agenda.upcoming.find((e) => e.eventId === 'market')?.ops).toBeUndefined()
  })

  it('missing plan marks hasPlan:false; a failed read attaches nothing', async () => {
    listEventsCore.mockResolvedValue([
      event({ id: 'no-plan' }),
      event({ id: 'flaky', slug: 'flaky', event_start: addDays(today, 2), event_end: addDays(today, 2) }),
    ])
    getOpsPlanCore.mockImplementation(async (_org: string, eventId: string) => {
      if (eventId === 'flaky') throw new Error('firestore unavailable')
      return null
    })
    const agenda = await getTodayAgenda('o1')
    expect(agenda.today.find((e) => e.eventId === 'no-plan')?.ops).toEqual({ hasPlan: false })
    expect(agenda.upcoming.find((e) => e.eventId === 'flaky')?.ops).toBeUndefined()
  })
})
