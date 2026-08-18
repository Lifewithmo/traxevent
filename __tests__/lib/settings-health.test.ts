import { describe, it, expect } from 'vitest'
import { buildSettingsAreas } from '@/lib/settings-health'

const base = {
  org: { name: 'BrewTrax', branding: undefined, public_profile: undefined, sending_domain_status: undefined },
  memberCount: 1,
  templateCount: 0,
}

describe('buildSettingsAreas', () => {
  it('returns one entry per settings area', () => {
    expect(buildSettingsAreas(base)).toHaveLength(10)
  })

  it('includes a reachable capacity area (route /<org>/capacity), never nagging', () => {
    const capacity = buildSettingsAreas(base).find((a) => a.slug === 'capacity')
    expect(capacity).toEqual({ slug: 'capacity', label: 'Resources & capacity', configured: true })
  })

  it('marks branding unconfigured when there is no logo', () => {
    const branding = buildSettingsAreas(base).find((a) => a.slug === 'branding')
    expect(branding?.configured).toBe(false)
  })

  it('marks branding configured once a logo is set', () => {
    const areas = buildSettingsAreas({ ...base, org: { ...base.org, branding: { logo_url: 'https://cdn/logo.png' } } })
    expect(areas.find((a) => a.slug === 'branding')?.configured).toBe(true)
  })

  it('marks proposal templates configured when at least one exists', () => {
    const areas = buildSettingsAreas({ ...base, templateCount: 2 })
    expect(areas.find((a) => a.slug === 'proposal-templates')?.configured).toBe(true)
  })

  it('marks members configured only when more than one member exists', () => {
    expect(buildSettingsAreas(base).find((a) => a.slug === 'members')?.configured).toBe(false)
    expect(buildSettingsAreas({ ...base, memberCount: 3 }).find((a) => a.slug === 'members')?.configured).toBe(true)
  })

  it('marks public profile configured when enabled', () => {
    const areas = buildSettingsAreas({ ...base, org: { ...base.org, public_profile: { enabled: true, handle: 'brewtrax', links: [] } } })
    expect(areas.find((a) => a.slug === 'public-profile')?.configured).toBe(true)
  })

  it('marks email domain configured when verified', () => {
    const areas = buildSettingsAreas({ ...base, org: { ...base.org, sending_domain_status: 'verified' as const } })
    expect(areas.find((a) => a.slug === 'email-domain')?.configured).toBe(true)
  })
})
