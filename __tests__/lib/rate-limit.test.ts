import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { store, runTransaction } = vi.hoisted(() => {
  const store = new Map<string, { count: number; window_start: number }>()
  const runTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: { key: string }) => {
        const data = store.get(ref.key)
        return { exists: data !== undefined, data: () => data }
      },
      set: (ref: { key: string }, value: { count: number; window_start: number }) => {
        store.set(ref.key, value)
      },
      update: (ref: { key: string }, value: { count: number }) => {
        const cur = store.get(ref.key)
        if (!cur) throw new Error('update on missing doc')
        store.set(ref.key, { ...cur, ...value })
      },
    }
    return fn(tx)
  })
  return { store, runTransaction }
})

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: (key: string) => ({ key }) })),
    runTransaction,
  },
}))

import { checkRateLimit } from '@/lib/rate-limit'

const OPTS = { limit: 3, windowMs: 60_000 }

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('checkRateLimit', () => {
  it('allows the first call and starts a window', async () => {
    expect(await checkRateLimit('k1', OPTS)).toEqual({ allowed: true })
    expect(store.get('k1')).toEqual({ count: 1, window_start: Date.now() })
  })

  it('increments within the window and denies at the limit', async () => {
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(false)
    expect(store.get('k1')!.count).toBe(3)
  })

  it('resets the counter when the window has elapsed', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('k1', OPTS)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(false)
    vi.setSystemTime(new Date('2026-08-08T12:01:01Z'))
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect(store.get('k1')!.count).toBe(1)
  })

  it('keys are independent', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('k1', OPTS)
    expect((await checkRateLimit('k2', OPTS)).allowed).toBe(true)
  })

  it('allows on transaction failure (availability over strictness)', async () => {
    runTransaction.mockRejectedValueOnce(new Error('firestore down'))
    expect(await checkRateLimit('k1', OPTS)).toEqual({ allowed: true })
  })
})
