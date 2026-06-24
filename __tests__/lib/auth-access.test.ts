import { describe, it, expect } from 'vitest'
import { canAccessCampPage } from '@/lib/auth/access'
import type { OrgMember } from '@/lib/types'

function member(o: Partial<OrgMember>): OrgMember {
  return { uid: 'u', role: 'staff', display_name: 'S', email: 's@x.org', camp_access: {}, ...o }
}

describe('canAccessCampPage', () => {
  it('owners and admins can access every page', () => {
    expect(canAccessCampPage(member({ role: 'owner' }), 'camp-1', 'budget')).toBe(true)
    expect(canAccessCampPage(member({ role: 'admin' }), 'camp-1', 'reports')).toBe(true)
  })

  it('staff can access only granted pages for the specific camp', () => {
    const m = member({ role: 'staff', camp_access: { 'camp-1': { pages: ['families', 'forms'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'families')).toBe(true)
    expect(canAccessCampPage(m, 'camp-1', 'budget')).toBe(false)
  })

  it('staff with no entry for the camp is denied', () => {
    const m = member({ role: 'staff', camp_access: { 'camp-2': { pages: ['families'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'families')).toBe(false)
  })
})
