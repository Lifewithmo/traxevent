import { describe, it, expect, vi, beforeEach } from 'vitest'
const notFoundSpy = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: notFoundSpy }))
const getOrgSpy = vi.hoisted(() => vi.fn())
vi.mock('@/actions/orgs', () => ({ getOrgBySlug: getOrgSpy }))
import { assertOrgModule } from '@/lib/auth/module-guard'

describe('assertOrgModule', () => {
  beforeEach(() => vi.clearAllMocks())
  it('passes when the org has the module (general pack / no pack)', async () => {
    getOrgSpy.mockResolvedValue({ id: 'o1', industry_pack_id: undefined })
    await assertOrgModule('acme', 'attendee-roster')
    expect(notFoundSpy).not.toHaveBeenCalled()
  })
  it('calls notFound when the org lacks the module (coffee-cart)', async () => {
    getOrgSpy.mockResolvedValue({ id: 'o1', industry_pack_id: 'coffee-cart' })
    await expect(assertOrgModule('acme', 'attendee-roster')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundSpy).toHaveBeenCalled()
  })
})
