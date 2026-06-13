import { describe, it, expect, vi, beforeEach } from 'vitest'

const { campUpdateSpy, campDocGetSpy } = vi.hoisted(() => ({
  campUpdateSpy: vi.fn().mockResolvedValue(undefined),
  campDocGetSpy: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    id: 'camp-id-123',
    orderBy: vi.fn().mockReturnThis(),
    get: campDocGetSpy,
    update: campUpdateSpy,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__deleted__') },
}))

import { buildCampSlug } from '@/lib/slug'
import { createCamp, updateCamp } from '@/actions/camps'

describe('buildCampSlug', () => {
  it('appends the year to the name slug', () => {
    expect(buildCampSlug('Family Camp', 2026)).toBe('family-camp-2026')
  })

  it('handles special characters', () => {
    expect(buildCampSlug("Women's Retreat", 2026)).toBe('womens-retreat-2026')
  })
})

describe('createCamp — event_type_id', () => {
  it('stores event_type_id when provided', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      event_type_id: 'gala',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('gala')
  })

  it('defaults event_type_id to summer-camp when omitted', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('summer-camp')
  })
})

describe('updateCamp', () => {
  beforeEach(() => {
    campDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1' }) })
    campDocGetSpy.mockClear()
    campUpdateSpy.mockClear()
    campUpdateSpy.mockResolvedValue(undefined)
  })

  it('updates the camp document with provided fields and updated_at', async () => {
    await updateCamp('org-1', 'camp-1', { name: 'New Name', status: 'active' })
    expect(campUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name', status: 'active', updated_at: expect.any(String) })
    )
  })

  it('only includes provided fields in the update', async () => {
    await updateCamp('org-1', 'camp-1', { capacity: 100 })
    const payload = campUpdateSpy.mock.calls[0][0]
    expect(payload).toMatchObject({ capacity: 100, updated_at: expect.any(String) })
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('status')
  })

  it('clears event_type_terminology with a delete sentinel when passed null', async () => {
    await updateCamp('org-1', 'camp-1', { event_type_terminology: null })
    const payload = campUpdateSpy.mock.calls[0][0]
    expect(payload.event_type_terminology).toBe('__deleted__')
  })

  it('leaves event_type_terminology unchanged when passed undefined', async () => {
    await updateCamp('org-1', 'camp-1', { name: 'X', event_type_terminology: undefined })
    const payload = campUpdateSpy.mock.calls[0][0]
    expect(payload).not.toHaveProperty('event_type_terminology')
  })

  it('throws "Camp not found" if the camp document does not exist', async () => {
    campDocGetSpy.mockResolvedValue({ exists: false })
    await expect(updateCamp('org-1', 'camp-999', {})).rejects.toThrow('Camp not found')
    expect(campUpdateSpy).not.toHaveBeenCalled()
  })
})
