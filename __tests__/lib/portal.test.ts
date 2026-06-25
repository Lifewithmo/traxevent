import { describe, it, expect } from 'vitest'
import { buildPortalEvents, portalThemeVars } from '@/lib/portal'
import type { Org, Camp } from '@/lib/types'

const org = (slug: string, name: string): Org =>
  ({ id: slug, name, slug, billing_status: 'active', created_at: '' }) as Org
const camp = (slug: string, name: string, camp_start: string): Camp =>
  ({ id: slug, name, slug, year: 2026, status: 'active', camp_start, camp_end: camp_start } as unknown as Camp)

describe('buildPortalEvents', () => {
  it('flattens orgs→camps into register links, sorted by start date', () => {
    const events = buildPortalEvents([
      { org: org('grace', 'Grace Chapel'), camps: [camp('retreat', 'Youth Retreat', '2026-07-01')] },
      { org: org('fbc', 'First Baptist'), camps: [camp('summer', 'Summer Camp', '2026-06-01')] },
    ])
    expect(events.map((e) => e.campSlug)).toEqual(['summer', 'retreat'])
    expect(events[0]).toMatchObject({
      orgSlug: 'fbc', orgName: 'First Baptist', campSlug: 'summer', campName: 'Summer Camp',
      year: 2026, registerPath: '/fbc/summer/register',
    })
  })

  it('returns an empty list when no orgs have camps', () => {
    expect(buildPortalEvents([{ org: org('x', 'X'), camps: [] }])).toEqual([])
  })
})

describe('portalThemeVars', () => {
  it('maps brand colors to CSS custom properties', () => {
    expect(portalThemeVars({ primary_color: '#123456', accent_color: '#abcdef' }))
      .toEqual({ '--portal-primary': '#123456', '--portal-accent': '#abcdef' })
  })

  it('omits unset colors', () => {
    expect(portalThemeVars({})).toEqual({})
  })
})
