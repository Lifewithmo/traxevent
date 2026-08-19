import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ uid: 'admin-1', role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'admin-1', role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ uid: 'admin-1', role: 'admin', event_access: {} }),
}))

// updateEvent's headcount hook reads/re-derives the ops plan through these
// cores; mocked so the existing firestore chain mock stays event-doc-only.
vi.mock('@/lib/ops/event-ops', () => ({
  getOpsPlanCore: vi.fn().mockResolvedValue(null),
  recomputeOpsListsCore: vi.fn().mockResolvedValue({}),
}))

const { eventUpdateSpy, eventDocGetSpy, slugQueryGetSpy } = vi.hoisted(() => ({
  eventUpdateSpy: vi.fn().mockResolvedValue(undefined),
  eventDocGetSpy: vi.fn(),
  // Slug-collision check inside createEventCore: `.where(...).limit(1).get()`.
  // Defaults to "no collision" so existing createEvent tests are unaffected.
  slugQueryGetSpy: vi.fn().mockResolvedValue({ empty: true }),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    id: 'camp-id-123',
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: slugQueryGetSpy })) })),
    get: eventDocGetSpy,
    update: eventUpdateSpy,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__deleted__') },
}))

import { buildEventSlug } from '@/lib/slug'
import { getOpsPlanCore, recomputeOpsListsCore } from '@/lib/ops/event-ops'
import { createEvent, updateEvent } from '@/actions/events'

describe('buildEventSlug', () => {
  it('appends the year to the name slug', () => {
    expect(buildEventSlug('Family Camp', 2026)).toBe('family-camp-2026')
  })

  it('handles special characters', () => {
    expect(buildEventSlug("Women's Retreat", 2026)).toBe('womens-retreat-2026')
  })
})

describe('createEvent — event_type_id', () => {
  it('stores event_type_id when provided', async () => {
    const event = await createEvent('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      event_type_id: 'catering',
      event_start: '2026-06-01',
      event_end: '2026-06-07',
    })
    expect(event.event_type_id).toBe('catering')
  })

  it('defaults event_type_id to event when omitted', async () => {
    const event = await createEvent('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      event_start: '2026-06-01',
      event_end: '2026-06-07',
    })
    expect(event.event_type_id).toBe('event')
  })
})

describe('createEvent — slug collisions', () => {
  beforeEach(() => {
    slugQueryGetSpy.mockReset()
  })

  it('appends a numeric suffix when the slug already exists', async () => {
    slugQueryGetSpy
      .mockResolvedValueOnce({ empty: false }) // 'smith-wedding-2026' taken
      .mockResolvedValueOnce({ empty: true })  // 'smith-wedding-2026-2' free
    const event = await createEvent('org-1', {
      name: 'Smith Wedding',
      year: 2026,
      registration_type: 'individual',
      event_start: '2026-09-12',
      event_end: '2026-09-12',
    })
    expect(event.slug).toBe('smith-wedding-2026-2')
  })
})

describe('createEvent — client-job hours', () => {
  beforeEach(() => {
    slugQueryGetSpy.mockReset()
    slugQueryGetSpy.mockResolvedValue({ empty: true })
  })

  it('persists optional start/end hours on a client-job event', async () => {
    const event = await createEvent('org-1', {
      name: 'Smith Wedding',
      year: 2026,
      registration_type: 'individual',
      event_start: '2026-09-12',
      event_end: '2026-09-12',
      hours: { start: '16:00', end: '21:00' },
    })
    expect(event.hours).toEqual({ start: '16:00', end: '21:00' })
  })

  it('creates a client-job event with no hours (hours optional)', async () => {
    const event = await createEvent('org-1', {
      name: 'Jones Wedding',
      year: 2026,
      registration_type: 'individual',
      event_start: '2026-09-12',
      event_end: '2026-09-12',
    })
    expect(event.hours).toBeUndefined()
    expect(event.id).toBeTruthy()
  })
})

describe('updateEvent', () => {
  beforeEach(() => {
    eventDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1' }) })
    eventDocGetSpy.mockClear()
    eventUpdateSpy.mockClear()
    eventUpdateSpy.mockResolvedValue(undefined)
  })

  it('updates the camp document with provided fields and updated_at', async () => {
    await updateEvent('org-1', 'camp-1', { name: 'New Name', status: 'active' })
    expect(eventUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name', status: 'active', updated_at: expect.any(String) })
    )
  })

  it('only includes provided fields in the update', async () => {
    await updateEvent('org-1', 'camp-1', { capacity: 100 })
    const payload = eventUpdateSpy.mock.calls[0][0]
    expect(payload).toMatchObject({ capacity: 100, updated_at: expect.any(String) })
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('status')
  })

  it('clears event_type_terminology with a delete sentinel when passed null', async () => {
    await updateEvent('org-1', 'camp-1', { event_type_terminology: null })
    const payload = eventUpdateSpy.mock.calls[0][0]
    expect(payload.event_type_terminology).toBe('__deleted__')
  })

  it('leaves event_type_terminology unchanged when passed undefined', async () => {
    await updateEvent('org-1', 'camp-1', { name: 'X', event_type_terminology: undefined })
    const payload = eventUpdateSpy.mock.calls[0][0]
    expect(payload).not.toHaveProperty('event_type_terminology')
  })

  it('throws "Event not found" if the event document does not exist', async () => {
    eventDocGetSpy.mockResolvedValue({ exists: false })
    await expect(updateEvent('org-1', 'camp-999', {})).rejects.toThrow('Event not found')
    expect(eventUpdateSpy).not.toHaveBeenCalled()
  })

  it('persists headcount and key_contacts', async () => {
    await updateEvent('org-1', 'camp-1', {
      headcount: 120,
      key_contacts: [{ name: 'Sam', role: 'Coordinator' }],
    })
    expect(eventUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        headcount: 120,
        key_contacts: [{ name: 'Sam', role: 'Coordinator' }],
      })
    )
  })

  it('strips undefined phone/email out of key_contacts before writing (Firestore rejects nested undefined)', async () => {
    await updateEvent('org-1', 'camp-1', {
      key_contacts: [{ name: 'Sam', role: 'Coordinator', phone: undefined, email: undefined }],
    })
    const payload = eventUpdateSpy.mock.calls[0][0]
    // toEqual() ignores keys whose value is `undefined`, which would mask the bug —
    // use toStrictEqual() so an explicit `phone: undefined` key fails the assertion.
    expect(payload.key_contacts).toStrictEqual([{ name: 'Sam', role: 'Coordinator' }])
  })
})

describe('updateEvent — headcount re-derive hook (spec 2026-08-19 B5)', () => {
  beforeEach(() => {
    eventDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', headcount: 100 }) })
    eventUpdateSpy.mockClear()
    vi.mocked(getOpsPlanCore).mockClear()
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    vi.mocked(recomputeOpsListsCore).mockClear()
  })

  it('re-derives the ops plan (with the new guest count) when headcount changes and a plan exists', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue({ package_ids: ['wp1'] } as never)
    await updateEvent('org-1', 'camp-1', { headcount: 120 })
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ headcount: 120 }))
    expect(recomputeOpsListsCore).toHaveBeenCalledWith('org-1', 'camp-1', 'admin-1', { guests: 120 })
  })

  it('skips the re-derive when no ops plan exists (headcount still saved)', async () => {
    await updateEvent('org-1', 'camp-1', { headcount: 120 })
    expect(getOpsPlanCore).toHaveBeenCalledWith('org-1', 'camp-1')
    expect(recomputeOpsListsCore).not.toHaveBeenCalled()
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ headcount: 120 }))
  })

  it('does not touch ops at all when headcount is unchanged', async () => {
    await updateEvent('org-1', 'camp-1', { headcount: 100, name: 'Renamed' })
    expect(getOpsPlanCore).not.toHaveBeenCalled()
    expect(recomputeOpsListsCore).not.toHaveBeenCalled()
  })

  it('does not touch ops when headcount is not among the updates', async () => {
    await updateEvent('org-1', 'camp-1', { name: 'Renamed' })
    expect(getOpsPlanCore).not.toHaveBeenCalled()
  })

  it('skips the re-derive for a non-positive headcount (lists cannot derive from 0 guests)', async () => {
    await updateEvent('org-1', 'camp-1', { headcount: 0 })
    expect(getOpsPlanCore).not.toHaveBeenCalled()
    expect(recomputeOpsListsCore).not.toHaveBeenCalled()
  })
})
