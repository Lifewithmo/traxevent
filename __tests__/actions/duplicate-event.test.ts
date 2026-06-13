import { describe, it, expect, vi, beforeEach } from 'vitest'

const newCampSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const newSlotSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const newAssignmentSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getSourceCampSpy = vi.hoisted(() => vi.fn())
const getSlotsSpy = vi.hoisted(() => vi.fn())
const getFormAssignmentsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const campsCollection = {
    doc: vi.fn().mockImplementation((id?: string) => {
      if (id) {
        return {
          id,
          get: getSourceCampSpy,
          collection: vi.fn().mockImplementation((sub: string) => {
            if (sub === 'assignment_slots') return { get: getSlotsSpy }
            if (sub === 'form_assignments') return { get: getFormAssignmentsSpy }
            return {}
          }),
        }
      }
      return {
        id: 'new-camp-id',
        set: newCampSetSpy,
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
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: vi.fn().mockReturnValue(campsCollection) }) }),
    },
  }
})

import { duplicateEvent } from '@/actions/camps'

const sourceCamp = {
  id: 'src', name: 'Summer Camp 2025', slug: 'summer-camp-2025', year: 2025, status: 'active',
  registration_type: 'family', event_type_id: 'summer-camp',
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  camp_start: '2025-07-10', camp_end: '2025-07-13', capacity: 100, payment_amount: 150,
  from_display_name: 'Summer Camp', reply_to_email: 'd@x.org', created_at: '2025-01-01',
}

describe('duplicateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSourceCampSpy.mockResolvedValue({ exists: true, data: () => sourceCamp })
    getSlotsSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'slot-1', name: 'Cabin 1', sort_order: 0, created_at: 'x' }) }] })
    getFormAssignmentsSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'fa-1', template_id: 't1', template_name: 'Waiver', template_version: 1, fields_snapshot: [], audience: 'registrant', required: true, created_at: 'x' }) }] })
  })

  it('creates a new draft camp copying settings with the new name/year/dates', async () => {
    const camp = await duplicateEvent('org-1', 'src', {
      name: 'Summer Camp 2026', year: 2026, camp_start: '2026-07-10', camp_end: '2026-07-13',
    })
    expect(newCampSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Summer Camp 2026',
        year: 2026,
        status: 'draft',
        registration_type: 'family',
        event_type_id: 'summer-camp',
        capacity: 100,
        payment_amount: 150,
        camp_start: '2026-07-10',
        camp_end: '2026-07-13',
      })
    )
    expect(camp.status).toBe('draft')
    expect(camp.name).toBe('Summer Camp 2026')
  })

  it('copies assignment slots and form assignments to the new event', async () => {
    await duplicateEvent('org-1', 'src', { name: 'X', year: 2026, camp_start: '2026-07-10', camp_end: '2026-07-13' })
    expect(newSlotSetSpy).toHaveBeenCalledTimes(1)
    expect(newAssignmentSetSpy).toHaveBeenCalledTimes(1)
  })

  it('throws when the source camp does not exist', async () => {
    getSourceCampSpy.mockResolvedValue({ exists: false })
    await expect(
      duplicateEvent('org-1', 'missing', { name: 'X', year: 2026, camp_start: '2026-07-10', camp_end: '2026-07-13' })
    ).rejects.toThrow('Source event not found')
  })
})
