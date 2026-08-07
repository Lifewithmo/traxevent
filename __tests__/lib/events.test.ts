import { describe, it, expect, vi, beforeEach } from 'vitest'

const setSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const whereGet = vi.hoisted(() => vi.fn())
const collRef = vi.hoisted(() => ({
  doc: vi.fn(() => ({ id: 'evt-1', set: setSpy })),
  where: vi.fn(() => ({ get: whereGet })),
  orderBy: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createEventCore, listEventsByLeadCore } from '@/lib/events'

const base = {
  name: 'Nguyen Wedding',
  year: 2026,
  registration_type: 'individual' as const,
  event_start: '2026-09-12',
  event_end: '2026-09-12',
}

describe('createEventCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores lead_id and headcount when supplied', async () => {
    const event = await createEventCore('o1', { ...base, lead_id: 'l1', headcount: 180 })
    expect(event.lead_id).toBe('l1')
    expect(event.headcount).toBe(180)
    expect(event.slug).toBe('nguyen-wedding-2026')
    expect(setSpy).toHaveBeenCalledOnce()
  })

  it('omits lead_id and headcount entirely when absent', async () => {
    const event = await createEventCore('o1', base)
    expect('lead_id' in event).toBe(false)
    expect('headcount' in event).toBe(false)
  })

  it('defaults event_type_id when omitted', async () => {
    const event = await createEventCore('o1', base)
    expect(event.event_type_id).toBe('event')
  })
})

describe('listEventsByLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queries by lead_id and sorts newest first in memory', async () => {
    whereGet.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'e-old', created_at: '2026-01-01T00:00:00.000Z' }) },
        { data: () => ({ id: 'e-new', created_at: '2026-05-01T00:00:00.000Z' }) },
      ],
    })
    const events = await listEventsByLeadCore('o1', 'l1')
    expect(collRef.where).toHaveBeenCalledWith('lead_id', '==', 'l1')
    expect(events.map((e) => e.id)).toEqual(['e-new', 'e-old'])
  })

  it('returns an empty array when the opportunity has no jobs', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    expect(await listEventsByLeadCore('o1', 'l1')).toEqual([])
  })
})
