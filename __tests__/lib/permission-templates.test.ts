import { describe, it, expect } from 'vitest'
import {
  getBuiltInPermissionTemplates,
  BUILT_IN_TEMPLATE_IDS,
} from '@/lib/permission-templates'

describe('getBuiltInPermissionTemplates', () => {
  it('returns the four built-in templates', () => {
    const all = getBuiltInPermissionTemplates()
    expect(all).toHaveLength(4)
    const ids = all.map((t) => t.id)
    expect(ids).toContain('builtin-cabin-leader')
    expect(ids).toContain('builtin-checkin-volunteer')
    expect(ids).toContain('builtin-finance-admin')
    expect(ids).toContain('builtin-event-overseer')
  })

  it('cabin leader grants families, assignments, forms', () => {
    const t = getBuiltInPermissionTemplates().find((x) => x.id === 'builtin-cabin-leader')!
    expect(t.pages).toEqual(['families', 'assignments', 'forms'])
    expect(t.name).toBe('Cabin Leader')
  })

  it('finance admin grants families, budget, reports', () => {
    const t = getBuiltInPermissionTemplates().find((x) => x.id === 'builtin-finance-admin')!
    expect(t.pages).toEqual(['families', 'budget', 'reports'])
  })

  it('event overseer grants everything except budget', () => {
    const t = getBuiltInPermissionTemplates().find((x) => x.id === 'builtin-event-overseer')!
    expect(t.pages).not.toContain('budget')
    expect(t.pages).toContain('families')
    expect(t.pages).toContain('reports')
  })

  it('returns a fresh copy each call (no shared mutable reference)', () => {
    const a = getBuiltInPermissionTemplates()
    const b = getBuiltInPermissionTemplates()
    expect(a).not.toBe(b)
    a[0].pages.push('budget')
    expect(b[0].pages).not.toContain('budget')
  })

  it('BUILT_IN_TEMPLATE_IDS lists all four ids', () => {
    expect(BUILT_IN_TEMPLATE_IDS).toEqual([
      'builtin-cabin-leader',
      'builtin-checkin-volunteer',
      'builtin-finance-admin',
      'builtin-event-overseer',
    ])
  })
})
