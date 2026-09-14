import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
  actions/event-type-profiles.ts is a THIN admin-guarded skin over the
  guard-free cores in lib/crm/event-type-admin.ts (the actions/capacity-config
  ↔ lib/capacity/units split). These tests pin exactly that: every wrapper
  asserts org admin FIRST, delegates verbatim, and never reaches the core when
  the guard rejects. Core behavior itself is covered in
  __tests__/lib/event-type-admin.test.ts.
*/

const cores = vi.hoisted(() => ({
  createEventTypeProfileCore: vi.fn(),
  renameEventTypeProfileCore: vi.fn(),
  mergeEventTypeProfilesCore: vi.fn(),
  deleteEventTypeProfileCore: vi.fn(),
  setEventTypeProfileArchivedCore: vi.fn(),
  adoptEventTypesFromHistoryCore: vi.fn(),
}))

vi.mock('@/lib/crm/event-type-admin', () => cores)

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

import {
  createEventTypeProfile,
  renameEventTypeProfile,
  mergeEventTypeProfiles,
  deleteEventTypeProfile,
  setEventTypeProfileArchived,
  adoptEventTypesFromHistory,
} from '@/actions/event-type-profiles'
import { assertOrgAdmin } from '@/lib/auth/assert'

beforeEach(() => vi.clearAllMocks())

describe('event-type profile actions (admin-guarded wrappers)', () => {
  it('createEventTypeProfile asserts admin then delegates and returns the profile', async () => {
    const profile = { id: 'a'.repeat(16), name: 'Wedding', needsMobile: true, needsVenue: true }
    cores.createEventTypeProfileCore.mockResolvedValue(profile)
    const input = { name: 'Wedding', needsMobile: true, needsVenue: true }
    expect(await createEventTypeProfile('org-1', input)).toEqual(profile)
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(cores.createEventTypeProfileCore).toHaveBeenCalledWith('org-1', input)
  })

  it('renameEventTypeProfile delegates and returns the backfill count', async () => {
    cores.renameEventTypeProfileCore.mockResolvedValue({ updated: 4 })
    expect(await renameEventTypeProfile('org-1', 'id-1', 'Weddings')).toEqual({ updated: 4 })
    expect(cores.renameEventTypeProfileCore).toHaveBeenCalledWith('org-1', 'id-1', 'Weddings')
  })

  it('mergeEventTypeProfiles delegates from → into', async () => {
    cores.mergeEventTypeProfilesCore.mockResolvedValue({ updated: 3 })
    expect(await mergeEventTypeProfiles('org-1', 'from-id', 'into-id')).toEqual({ updated: 3 })
    expect(cores.mergeEventTypeProfilesCore).toHaveBeenCalledWith('org-1', 'from-id', 'into-id')
  })

  it('deleteEventTypeProfile passes the guard-as-return-value verdict through', async () => {
    cores.deleteEventTypeProfileCore.mockResolvedValue({ ok: false, usage: 7 })
    expect(await deleteEventTypeProfile('org-1', 'id-1')).toEqual({ ok: false, usage: 7 })
    expect(cores.deleteEventTypeProfileCore).toHaveBeenCalledWith('org-1', 'id-1')
  })

  it('setEventTypeProfileArchived delegates the flag', async () => {
    cores.setEventTypeProfileArchivedCore.mockResolvedValue(undefined)
    await setEventTypeProfileArchived('org-1', 'id-1', true)
    expect(cores.setEventTypeProfileArchivedCore).toHaveBeenCalledWith('org-1', 'id-1', true)
  })

  it('adoptEventTypesFromHistory delegates the entries', async () => {
    cores.adoptEventTypesFromHistoryCore.mockResolvedValue({ created: 2, adopted: 5 })
    const entries = [{ name: 'Gala', needsMobile: true, needsVenue: true }]
    expect(await adoptEventTypesFromHistory('org-1', entries)).toEqual({ created: 2, adopted: 5 })
    expect(cores.adoptEventTypesFromHistoryCore).toHaveBeenCalledWith('org-1', entries)
  })

  it('every wrapper rejects without touching its core when admin is denied', async () => {
    vi.mocked(assertOrgAdmin).mockRejectedValue(new Error('Forbidden'))
    await expect(createEventTypeProfile('org-1', { name: 'X', needsMobile: true, needsVenue: false })).rejects.toThrow('Forbidden')
    await expect(renameEventTypeProfile('org-1', 'i', 'X')).rejects.toThrow('Forbidden')
    await expect(mergeEventTypeProfiles('org-1', 'a', 'b')).rejects.toThrow('Forbidden')
    await expect(deleteEventTypeProfile('org-1', 'i')).rejects.toThrow('Forbidden')
    await expect(setEventTypeProfileArchived('org-1', 'i', true)).rejects.toThrow('Forbidden')
    await expect(adoptEventTypesFromHistory('org-1', [])).rejects.toThrow('Forbidden')
    for (const core of Object.values(cores)) expect(core).not.toHaveBeenCalled()
  })
})
