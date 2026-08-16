import { describe, it, expect } from 'vitest'
import { findExpiringDocs } from '@/lib/catalog-health'
import type { ComplianceDoc } from '@/lib/types'

function doc(id: string, expires?: string): ComplianceDoc {
  return { id, name: `Doc ${id}`, expires_on: expires, created_at: '2026-01-01' }
}

describe('findExpiringDocs', () => {
  it('includes docs expiring within the window, soonest first', () => {
    const out = findExpiringDocs([doc('b', '2026-09-10'), doc('a', '2026-08-20')], '2026-08-15')
    expect(out.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('includes already-expired docs with a negative daysLeft', () => {
    const out = findExpiringDocs([doc('a', '2026-08-10')], '2026-08-15')
    expect(out[0].daysLeft).toBe(-5)
  })

  it('excludes docs expiring beyond the window', () => {
    expect(findExpiringDocs([doc('a', '2026-12-01')], '2026-08-15')).toEqual([])
  })

  it('excludes docs with no expiry date', () => {
    expect(findExpiringDocs([doc('a')], '2026-08-15')).toEqual([])
  })

  it('computes daysLeft for a future expiry', () => {
    expect(findExpiringDocs([doc('a', '2026-08-25')], '2026-08-15')[0].daysLeft).toBe(10)
  })

  it('honours a custom window', () => {
    expect(findExpiringDocs([doc('a', '2026-08-25')], '2026-08-15', 5)).toEqual([])
  })
})
