import { describe, it, expect } from 'vitest'
import { isJobRoute, ORG_PAGE_SLUGS } from '@/lib/sidebar-nav'

describe('isJobRoute', () => {
  it('is true inside a job', () => {
    expect(isJobRoute('/acme/hendricks', 'acme')).toBe(true)
    expect(isJobRoute('/acme/hendricks/budget', 'acme')).toBe(true)
  })

  it('is false on the org root and on org pages', () => {
    expect(isJobRoute('/acme', 'acme')).toBe(false)
    expect(isJobRoute('/acme/invoices', 'acme')).toBe(false)
    expect(isJobRoute('/acme/leads/tasks', 'acme')).toBe(false)
    expect(isJobRoute('/acme/new-event', 'acme')).toBe(false)
  })

  it('is false when the path does not belong to this org', () => {
    expect(isJobRoute('/other/hendricks', 'acme')).toBe(false)
    expect(isJobRoute('', 'acme')).toBe(false)
  })

  it('lists every settings child as an org page', () => {
    for (const slug of ['branding', 'proposal-templates', 'public-profile']) {
      expect(ORG_PAGE_SLUGS.has(slug)).toBe(true)
    }
  })
})
