import { describe, it, expect, vi, beforeEach } from 'vitest'

const itemDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const eventUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'events') {
                return {
                  doc: vi.fn().mockReturnValue({
                    update: eventUpdateSpy,
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'itinerary') {
                        return {
                          doc: vi.fn().mockReturnValue(itemDocSpy),
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
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

import { assertEventPage } from '@/lib/auth/assert'
import * as itineraryActions from '@/actions/itinerary'
import {
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  setItineraryPublished,
} from '@/actions/itinerary'

describe('endpoint surface', () => {
  it('exports NO read action — listItinerary was an unauthenticated POST endpoint (cross-org read); the read lives in lib/itinerary-data.ts listItineraryCore', () => {
    expect((itineraryActions as Record<string, unknown>).listItinerary).toBeUndefined()
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
    expect(assertEventPage).toHaveBeenCalledWith('org-1', 'camp-1', 'itinerary')
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
    expect(assertEventPage).toHaveBeenCalledWith('org-1', 'camp-1', 'itinerary')
  })
})

describe('deleteItineraryItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the item document', async () => {
    await deleteItineraryItem('org-1', 'camp-1', 'i1')
    expect(itemDocSpy.delete).toHaveBeenCalled()
    expect(assertEventPage).toHaveBeenCalledWith('org-1', 'camp-1', 'itinerary')
  })
})

describe('setItineraryPublished', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the camp itinerary_published flag', async () => {
    await setItineraryPublished('org-1', 'camp-1', true)
    expect(eventUpdateSpy).toHaveBeenCalledWith({ itinerary_published: true })
    expect(assertEventPage).toHaveBeenCalledWith('org-1', 'camp-1', 'itinerary')
  })
})
