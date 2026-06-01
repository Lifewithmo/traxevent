import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  },
}))

import { generateAccessToken, isTokenExpired } from '@/lib/tokens'

describe('generateAccessToken', () => {
  it('returns a 48-char hex string', () => {
    const token = generateAccessToken()
    expect(token).toMatch(/^[a-f0-9]{48}$/)
  })

  it('returns a unique value each call', () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken())
  })
})

describe('isTokenExpired', () => {
  it('returns false for a future expiry date', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    expect(isTokenExpired(future)).toBe(false)
  })

  it('returns true for a past expiry date', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    expect(isTokenExpired(past)).toBe(true)
  })
})
