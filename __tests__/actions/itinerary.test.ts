import { describe, it, expect, vi, beforeEach } from 'vitest'

const itemDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const campUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getItemsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    update: campUpdateSpy,
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'itinerary') {
                        return {
                          doc: vi.fn().mockReturnValue(itemDocSpy),
                          get: getItemsSpy,
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

import {
  listItinerary,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  setItineraryPublished,
} from '@/actions/itinerary'

describe('listItinerary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all itinerary items', async () => {
    getItemsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'i1', day: '2026-07-10', start_time: '09:00', title: 'A', sort_order: 0, created_at: 'x' }) }],
    })
    const items = await listItinerary('org-1', 'camp-1')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('A')
  })
})

describe('createItineraryItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an item with the provided fields and a generated id', async () => {
    const it = await createItineraryItem('org-1', 'camp-1', {
      day: '2026-07-10',
      start_time: '09:00',
      end_time: '10:00',
      title: 'Opening',
      location: 'Main Hall',
      sort_order: 0,
    })
    expect(itemDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        day: '2026-07-10',
        start_time: '09:00',
        end_time: '10:00',
        title: 'Opening',
        location: 'Main Hall',
        sort_order: 0,
        created_at: expect.any(String),
      })
    )
    expect(it.title).toBe('Opening')
    expect(it.id).toBeTruthy()
  })

  it('omits optional fields that are not provided', async () => {
    await createItineraryItem('org-1', 'camp-1', {
      day: '2026-07-10',
      start_time: '09:00',
      title: 'Minimal',
      sort_order: 0,
    })
    const stored = itemDocSpy.set.mock.calls[0][0]
    expect(stored).not.toHaveProperty('end_time')
    expect(stored).not.toHaveProperty('location')
    expect(stored).not.toHaveProperty('description')
  })
})

describe('updateItineraryItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates fields and sets updated_at', async () => {
    await updateItineraryItem('org-1', 'camp-1', 'i1', { title: 'Renamed' })
    expect(itemDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed', updated_at: expect.any(String) })
    )
  })
})

describe('deleteItineraryItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the item document', async () => {
    await deleteItineraryItem('org-1', 'camp-1', 'i1')
    expect(itemDocSpy.delete).toHaveBeenCalled()
  })
})

describe('setItineraryPublished', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the camp itinerary_published flag', async () => {
    await setItineraryPublished('org-1', 'camp-1', true)
    expect(campUpdateSpy).toHaveBeenCalledWith({ itinerary_published: true })
  })
})
