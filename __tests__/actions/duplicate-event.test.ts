import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

const newEventSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const newSlotSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const newAssignmentSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getSourceEventSpy = vi.hoisted(() => vi.fn())
const getSlotsSpy = vi.hoisted(() => vi.fn())
const getFormAssignmentsSpy = vi.hoisted(() => vi.fn())
const slugQuerySpy = vi.hoisted(() => vi.fn())
const newEventDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => {
  const eventsCollection = {
    where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: slugQuerySpy }) }),
    doc: vi.fn().mockImplementation((id?: string) => {
      if (id) {
        return {
          id,
          get: getSourceEventSpy,
          collection: vi.fn().mockImplementation((sub: string) => {
            if (sub === 'assignment_slots') return { get: getSlotsSpy }
            if (sub === 'form_assignments') return { get: getFormAssignmentsSpy }
            return {}
          }),
        }
      }
      return {
        id: 'new-camp-id',
        set: newEventSetSpy,
        delete: newEventDeleteSpy,
        collection: vi.fn().mockImplementation((sub: string) => {
          if (sub === 'assignment_slots') return { doc: vi.fn().mockReturnValue({ set: newSlotSetSpy }) }
          if (sub === 'form_assignments') return { doc: vi.fn().mockReturnValue({ set: newAssignmentSetSpy }) }
          return { doc: vi.fn().mockReturnValue({ set: vi.fn() }) }
        }),
      }
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: vi.fn().mockReturnValue(eventsCollection) }) }),
    },
  }
})

import { duplicateEvent } from '@/actions/events'

const sourceEvent = {
  id: 'src', name: 'Annual Gathering 2025', slug: 'annual-gathering-2025', year: 2025, status: 'active',
  registration_type: 'family', event_type_id: 'event',
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  event_start: '2025-07-10', event_end: '2025-07-13', capacity: 100, payment_amount: 150,
  from_display_name: 'Annual Gathering', reply_to_email: 'd@x.org', created_at: '2025-01-01',
}

describe('duplicateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSourceEventSpy.mockResolvedValue({ exists: true, data: () => sourceEvent })
    getSlotsSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'slot-1', name: 'Cabin 1', sort_order: 0, created_at: 'x' }) }] })
    getFormAssignmentsSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'fa-1', template_id: 't1', template_name: 'Waiver', template_version: 1, fields_snapshot: [], audience: 'registrant', required: true, created_at: 'x' }) }] })
    slugQuerySpy.mockResolvedValue({ empty: true })
  })

  it('creates a new draft camp copying settings with the new name/year/dates', async () => {
    const event = await duplicateEvent('org-1', 'src', {
      name: 'Annual Gathering 2026', year: 2026, event_start: '2026-07-10', event_end: '2026-07-13',
    })
    expect(newEventSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Annual Gathering 2026',
        year: 2026,
        status: 'draft',
        registration_type: 'family',
        event_type_id: 'event',
        capacity: 100,
        payment_amount: 150,
        event_start: '2026-07-10',
        event_end: '2026-07-13',
      })
    )
    expect(event.status).toBe('draft')
    expect(event.name).toBe('Annual Gathering 2026')
  })

  it('copies assignment slots and form assignments to the new event', async () => {
    await duplicateEvent('org-1', 'src', { name: 'X', year: 2026, event_start: '2026-07-10', event_end: '2026-07-13' })
    expect(newSlotSetSpy).toHaveBeenCalledTimes(1)
    expect(newAssignmentSetSpy).toHaveBeenCalledTimes(1)
  })

  it('throws when the source camp does not exist', async () => {
    getSourceEventSpy.mockResolvedValue({ exists: false })
    await expect(
      duplicateEvent('org-1', 'missing', { name: 'X', year: 2026, event_start: '2026-07-10', event_end: '2026-07-13' })
    ).rejects.toThrow('Source event not found')
  })

  it('appends a numeric suffix when the slug already exists', async () => {
    // first lookup: taken; second lookup: free
    slugQuerySpy
      .mockResolvedValueOnce({ empty: false })
      .mockResolvedValueOnce({ empty: true })
    const event = await duplicateEvent('org-1', 'src', {
      name: 'Annual Gathering', year: 2026, event_start: '2026-07-10', event_end: '2026-07-13',
    })
    expect(event.slug).toBe('annual-gathering-2026-2')
  })
})
