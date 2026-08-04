import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEventsSpy = vi.hoisted(() => vi.fn())
const listLeadsSpy = vi.hoisted(() => vi.fn())
const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))

vi.mock('@/actions/events', () => ({ listEvents: listEventsSpy }))
vi.mock('@/actions/leads', () => ({ listLeads: listLeadsSpy }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy }))

import { getOrgCalendar } from '@/actions/calendar'

describe('getOrgCalendar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asserts membership then returns the merged, date-sorted calendar', async () => {
    listEventsSpy.mockResolvedValue([
      { id: 'c1', name: 'Summer Camp', slug: 'summer-camp', event_start: '2026-07-10' },
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
    expect(items[1].href).toBe('/my-org/summer-camp/dashboard')
  })
})
