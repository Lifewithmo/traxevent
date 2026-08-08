import { describe, it, expect } from 'vitest'
import { normalizeTags } from '@/lib/crm/customers'

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
