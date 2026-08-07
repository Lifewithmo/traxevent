import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.hoisted(() => vi.fn())
const doc = vi.hoisted(() => vi.fn().mockReturnValue({ update, get: vi.fn(), set: vi.fn() }))
const collection = vi.hoisted(() => vi.fn().mockReturnValue({ doc }))

vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn() }))
vi.mock('@/actions/auth', () => ({ setOrgClaims: vi.fn() }))

import { updateOrgBranding } from '@/actions/orgs'
import { assertOrgAdmin } from '@/lib/auth/assert'

beforeEach(() => vi.clearAllMocks())

describe('updateOrgBranding', () => {
  it('validates, persists, and returns the stored branding', async () => {
    const res = await updateOrgBranding('o1', {
      display_name: ' BrewTrax ',
      accent_color: '#1D4ED8',
    })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(collection).toHaveBeenCalledWith('orgs')
    expect(doc).toHaveBeenCalledWith('o1')
    expect(update).toHaveBeenCalledWith({ branding: { display_name: 'BrewTrax', accent_color: '#1d4ed8' } })
    expect(res).toEqual({ display_name: 'BrewTrax', accent_color: '#1d4ed8' })
  })

  it('rejects invalid input without writing', async () => {
    await expect(updateOrgBranding('o1', { accent_color: 'red' })).rejects.toThrow(/#rrggbb/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('persists an empty object when everything is cleared', async () => {
    await updateOrgBranding('o1', {})
    expect(update).toHaveBeenCalledWith({ branding: {} })
  })
})
