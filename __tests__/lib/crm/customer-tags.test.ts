import { describe, it, expect, vi } from 'vitest'
import { normalizeTags } from '@/lib/crm/customers'

// Mocked here the same way ActivityTimeline.test.tsx and OpportunityDetailClient.test.tsx mock it
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {},
  adminAuth: {},
  adminBucket: {},
}))

describe('normalizeTags', () => {
  it('trims whitespace and drops empty entries', () => {
    expect(normalizeTags(['  vip ', '', '   '])).toEqual(['vip'])
  })
  it('dedupes case-insensitively, keeping first-seen casing', () => {
    expect(normalizeTags(['VIP', 'vip', 'Repeat', 'repeat'])).toEqual(['VIP', 'Repeat'])
  })
  it('returns [] for []', () => {
    expect(normalizeTags([])).toEqual([])
  })
})
