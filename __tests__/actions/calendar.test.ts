import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEventsSpy = vi.hoisted(() => vi.fn())
const listLeadsSpy = vi.hoisted(() => vi.fn())
const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))
const listEventsCoreSpy = vi.hoisted(() => vi.fn())
const listLeadsCoreSpy = vi.hoisted(() => vi.fn())
const listTasksCoreSpy = vi.hoisted(() => vi.fn())

vi.mock('@/actions/events', () => ({ listEvents: listEventsSpy }))
vi.mock('@/actions/leads', () => ({ listLeads: listLeadsSpy }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy }))
vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy }))
vi.mock('@/lib/crm/leads', () => ({ listLeadsCore: listLeadsCoreSpy }))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore: listTasksCoreSpy }))
// getCalendarFeed's assembly module reaches firebase-admin at import time.
vi.mock('@/lib/calendar-feed', () => ({ assembleCalendarFeed: vi.fn() }))

import { getOrgCalendar, listCalendarRange } from '@/actions/calendar'

describe('getOrgCalendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership then returns the merged, date-sorted calendar', async () => {
    listEventsSpy.mockResolvedValue([
      { id: 'c1', name: 'Spring Gathering', slug: 'spring-gathering', event_start: '2026-07-10' },
    ])
    listLeadsSpy.mockResolvedValue([
      { id: 'l1', name: 'Acme Wedding', stage: 'inquiry', event_date: '2026-07-05', created_at: 'x' },
    ])

    const items = await getOrgCalendar('org-1', 'my-org')

    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsSpy).toHaveBeenCalledWith('org-1')
    expect(listLeadsSpy).toHaveBeenCalledWith('org-1')
    expect(items.map((i) => i.id)).toEqual(['l1', 'c1'])
    expect(items.map((i) => i.kind)).toEqual(['lead', 'event'])
    expect(items[0].href).toBe('/my-org/leads/l1')
    expect(items[1].href).toBe('/my-org/spring-gathering/dashboard')
  })
})

describe('listCalendarRange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership, fetches tasks only for open-stage leads in parallel, and returns the merged range', async () => {
    listEventsCoreSpy.mockResolvedValue([])
    listLeadsCoreSpy.mockResolvedValue([
      { id: 'l1', name: 'Open Lead', stage: 'inquiry', created_at: 'x' },
      { id: 'l2', name: 'Closed Lead', stage: 'closed_won', created_at: 'x' },
    ])
    listTasksCoreSpy.mockResolvedValue([
      { id: 't1', lead_id: 'l1', title: 'Follow up', done: false, due_date: '2026-08-10', created_at: 'x' },
    ])

    const items = await listCalendarRange('org-1', 'my-org', '2026-08-01', '2026-08-31')

    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    expect(listEventsCoreSpy).toHaveBeenCalledWith('org-1')
    expect(listLeadsCoreSpy).toHaveBeenCalledWith('org-1')
    // Tasks are fetched per open lead only — never for the closed-stage lead.
    expect(listTasksCoreSpy).toHaveBeenCalledTimes(1)
    expect(listTasksCoreSpy).toHaveBeenCalledWith('org-1', 'l1')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['task:t1'])
  })
})
