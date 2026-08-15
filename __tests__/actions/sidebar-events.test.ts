import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Event } from '@/lib/types'

const listEvents = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/events', () => ({ listEvents: (...a: unknown[]) => listEvents(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { listSidebarEvents } from '@/actions/sidebar-events'

function ev(id: string, start: string): Event {
  return { id, name: `Event ${id}`, slug: `event-${id}`, event_start: start, status: 'active' } as Event
}

describe('listSidebarEvents', () => {
  beforeEach(() => {
    listEvents.mockReset()
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    listEvents.mockResolvedValue([])
    await listSidebarEvents('org1', '2026-08-15')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('returns at most 5 rows from the org event list', async () => {
    listEvents.mockResolvedValue([
      ev('a', '2026-08-16'), ev('b', '2026-08-17'), ev('c', '2026-08-18'),
      ev('d', '2026-08-19'), ev('e', '2026-08-20'), ev('f', '2026-08-21'),
    ])
    const rows = await listSidebarEvents('org1', '2026-08-15')
    expect(rows).toHaveLength(5)
    expect(rows[0].id).toBe('a')
  })
})
