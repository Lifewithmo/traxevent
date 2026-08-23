import { describe, it, expect, vi, beforeEach } from 'vitest'

const getItemsSpy = vi.hoisted(() => vi.fn())
const pathSpy = vi.hoisted(() => ({ orgDoc: vi.fn(), eventDoc: vi.fn() }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col !== 'orgs') return {}
      return {
        doc: vi.fn().mockImplementation((orgId: string) => {
          pathSpy.orgDoc(orgId)
          return {
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub !== 'events') return {}
              return {
                doc: vi.fn().mockImplementation((eventId: string) => {
                  pathSpy.eventDoc(eventId)
                  return {
                    collection: vi.fn().mockImplementation((sub2: string) =>
                      sub2 === 'itinerary' ? { get: getItemsSpy } : {}
                    ),
                  }
                }),
              }
            }),
          }
        }),
      }
    }),
  },
}))

import { listItineraryCore } from '@/lib/itinerary-data'

describe('listItineraryCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads orgs/{orgId}/events/{eventId}/itinerary and returns the raw items (bare .get(), no ordering — callers group/sort in memory)', async () => {
    getItemsSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'i2', day: '2026-07-11', start_time: '08:00', title: 'B', sort_order: 1, created_at: 'y' }) },
        { data: () => ({ id: 'i1', day: '2026-07-10', start_time: '09:00', title: 'A', sort_order: 0, created_at: 'x' }) },
      ],
    })
    const items = await listItineraryCore('org-1', 'camp-1')
    expect(pathSpy.orgDoc).toHaveBeenCalledWith('org-1')
    expect(pathSpy.eventDoc).toHaveBeenCalledWith('camp-1')
    // Firestore order preserved untouched — proof there is no hidden re-sort.
    expect(items.map((i) => i.id)).toEqual(['i2', 'i1'])
  })

  it('returns an empty array when the event has no itinerary items', async () => {
    getItemsSpy.mockResolvedValue({ docs: [] })
    expect(await listItineraryCore('org-1', 'camp-1')).toEqual([])
  })
})
