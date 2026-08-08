import { describe, it, expect } from 'vitest'
import { isProposalOpened, openStampPatch } from '@/lib/proposal-opens'

describe('isProposalOpened', () => {
  it('true with a first_opened_at stamp or a legacy viewed event', () => {
    expect(isProposalOpened({ first_opened_at: '2026-08-01T00:00:00.000Z' })).toBe(true)
    expect(isProposalOpened({ events: [{ kind: 'viewed', at: 'x' }] })).toBe(true)
    expect(isProposalOpened({ events: [{ kind: 'sent', at: 'x' }] })).toBe(false)
    expect(isProposalOpened({})).toBe(false)
  })
})

describe('openStampPatch', () => {
  const now = '2026-08-07T20:00:00.000Z'
  it('sets both stamps on first open', () => {
    expect(openStampPatch({}, now)).toEqual({ first_opened_at: now, last_opened_at: now })
  })
  it('updates last_opened_at when the previous open is over an hour old', () => {
    expect(openStampPatch({ first_opened_at: 'a', last_opened_at: '2026-08-07T18:59:00.000Z' }, now))
      .toEqual({ last_opened_at: now })
  })
  it('is empty within the one-hour throttle', () => {
    expect(openStampPatch({ first_opened_at: 'a', last_opened_at: '2026-08-07T19:30:00.000Z' }, now))
      .toEqual({})
  })
})
