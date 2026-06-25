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

describe('canAccessCampPage — department inheritance', () => {
  it('grants access when the member has a department grant for the camp\'s department', () => {
    const m = member({ role: 'staff', camp_access: {}, department_access: { 'dept-1': { pages: ['forms', 'families'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'forms', 'dept-1')).toBe(true)
    expect(canAccessCampPage(m, 'camp-1', 'budget', 'dept-1')).toBe(false)
  })

  it('does not grant a department page when the camp is in a different/absent department', () => {
    const m = member({ role: 'staff', department_access: { 'dept-1': { pages: ['forms'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'forms', 'dept-2')).toBe(false)
    expect(canAccessCampPage(m, 'camp-1', 'forms', null)).toBe(false)
    expect(canAccessCampPage(m, 'camp-1', 'forms')).toBe(false)
  })

  it('explicit camp grant still works regardless of department', () => {
    const m = member({ role: 'staff', camp_access: { 'camp-1': { pages: ['families'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'families', 'dept-1')).toBe(true)
  })

  it('camp grant OR department grant (union)', () => {
    const m = member({ role: 'staff', camp_access: { 'camp-1': { pages: ['families'] } }, department_access: { 'dept-1': { pages: ['forms'] } } })
    expect(canAccessCampPage(m, 'camp-1', 'families', 'dept-1')).toBe(true)
    expect(canAccessCampPage(m, 'camp-1', 'forms', 'dept-1')).toBe(true)
  })
})
