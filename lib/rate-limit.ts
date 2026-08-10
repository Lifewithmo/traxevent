import { adminDb } from '@/lib/firebase-admin'

export interface RateLimitOptions {
  limit: number
  windowMs: number
}

// Top-level collection; only the admin SDK reads or writes it (default-deny rules).
export function rateLimitsRef() {
  return adminDb.collection('rate_limits')
}

/**
 * Fixed-window rate limiter shared by all public endpoints. Counter and window
 * start live in a single doc per key; the read-check-write runs in one
 * transaction so concurrent submissions cannot both pass at the limit.
 *
 * Failure posture: limit exceeded => denied; infrastructure error => allowed.
 * If Firestore is down the whole product is down — a broken limiter must not
 * be the thing that blocks a legitimate submission.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<{ allowed: boolean }> {
  try {
    return await adminDb.runTransaction(async (tx) => {
      const ref = rateLimitsRef().doc(key)
      const snap = await tx.get(ref)
      const now = Date.now()
      const data = snap.exists
        ? (snap.data() as { count: number; window_start: number })
        : undefined
      if (!data || now - data.window_start >= opts.windowMs) {
        tx.set(ref, { count: 1, window_start: now })
        return { allowed: true }
      }
      if (data.count >= opts.limit) return { allowed: false }
      tx.update(ref, { count: data.count + 1 })
      return { allowed: true }
    })
  } catch (err) {
    console.error('checkRateLimit failed', err)
    return { allowed: true }
  }
}
