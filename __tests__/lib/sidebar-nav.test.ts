import { describe, it, expect } from 'vitest'
import { ORG_PAGE_SLUGS } from '@/lib/sidebar-nav'

describe('ORG_PAGE_SLUGS', () => {
  it('lists every settings child as an org page', () => {
    for (const slug of ['branding', 'proposal-templates', 'public-profile']) {
      expect(ORG_PAGE_SLUGS.has(slug)).toBe(true)
    }
  })
})
