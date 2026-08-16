import { describe, it, expect } from 'vitest'
import { kindOf, EVENT_KIND_LABELS } from '@/lib/occasions/kind'

describe('kindOf', () => {
  it('treats absent kind as client_job (zero-migration default)', () => {
    expect(kindOf({})).toBe('client_job')
    expect(kindOf({ kind: undefined })).toBe('client_job')
  })
  it('passes explicit kinds through', () => {
    expect(kindOf({ kind: 'market_day' })).toBe('market_day')
    expect(kindOf({ kind: 'client_job' })).toBe('client_job')
  })
  it('labels both kinds', () => {
    expect(EVENT_KIND_LABELS.client_job).toBe('Client job')
    expect(EVENT_KIND_LABELS.market_day).toBe('Market day')
  })
})
