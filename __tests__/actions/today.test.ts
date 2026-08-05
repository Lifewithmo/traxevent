import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }) }))
const listLeads = vi.fn()
const listTasks = vi.fn()
vi.mock('@/actions/leads', () => ({ listLeads: (...a: unknown[]) => listLeads(...a) }))
vi.mock('@/actions/tasks', () => ({ listTasks: (...a: unknown[]) => listTasks(...a) }))

import { getTodayData } from '@/actions/today'

describe('getTodayData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches tasks only for open leads and returns aggregated data', async () => {
    listLeads.mockResolvedValue([
      { id: 'open1', name: 'A', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 200 },
      { id: 'closed1', name: 'B', stage: 'closed_won', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 999 },
    ])
    listTasks.mockResolvedValue([]) // open1 has no tasks -> needs attention
    const data = await getTodayData('o1')
    // listTasks called once, for the open lead only
    expect(listTasks).toHaveBeenCalledTimes(1)
    expect(listTasks).toHaveBeenCalledWith('o1', 'open1')
    expect(data.needsAttention.map((n) => n.leadId)).toEqual(['open1'])
    expect(data.tiles.openPipelineValue).toBe(200)
  })
})
