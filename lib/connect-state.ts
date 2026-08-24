import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Signed OAuth `state` for the Stripe Connect flow (app/api/connect/*).
 *
 * The state is HMAC-SHA256 signed so the callback can trust the org it names
 * without treating any client input as authoritative, carries a mint
 * timestamp so stale links die, and carries a nonce that is echoed in an
 * httpOnly cookie so the flow can only complete in the browser that
 * initiated it (CSRF binding).
 *
 * Wire format: base64url(payload JSON) + '.' + base64url(hmac-sha256).
 */

export const CONNECT_NONCE_COOKIE = 'tx_connect_nonce'

// How long a signed state (and its nonce cookie) stays valid.
export const CONNECT_STATE_MAX_AGE_SECONDS = 60 * 60 // 1 hour

// Tolerated forward clock skew before a future-dated `ts` is rejected.
const CLOCK_SKEW_MS = 5 * 60 * 1000

export interface ConnectStatePayload {
  orgId: string
  orgSlug: string
  nonce: string
  ts: number // ms since epoch, minted at signing time
}

// Signing key. Prefers a dedicated CONNECT_STATE_SECRET; otherwise the key is
// DERIVED (HMAC with a domain-separation label, so the raw key is never used
// directly for anything else) from STRIPE_SECRET_KEY, which this flow already
// requires for the code->token exchange.
//
// LOUD: CONNECT_STATE_SECRET is OPTIONAL by design. Do NOT turn it into a new
// required env var — the STRIPE_SECRET_KEY fallback keeps every existing
// deployment working with zero configuration changes. Note that rotating the
// underlying secret invalidates in-flight states (max 1 hour of them).
function stateKey(): Buffer {
  const secret = process.env.CONNECT_STATE_SECRET || process.env.STRIPE_SECRET_KEY
  if (!secret) {
    throw new Error(
      'Cannot sign Stripe Connect OAuth state: set CONNECT_STATE_SECRET or STRIPE_SECRET_KEY'
    )
  }
  return createHmac('sha256', secret).update('traxevent:connect-oauth-state:v1').digest()
}

function sign(body: Buffer): Buffer {
  return createHmac('sha256', stateKey()).update(body).digest()
}

// Mint a signed state for the authorize redirect. Returns the nonce
// separately so the caller can set it as the CSRF-binding cookie.
export function signConnectState(input: { orgId: string; orgSlug: string }): {
  state: string
  nonce: string
} {
  const nonce = randomBytes(16).toString('hex')
  const payload: ConnectStatePayload = {
    orgId: input.orgId,
    orgSlug: input.orgSlug,
    nonce,
    ts: Date.now(),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  return { state: `${body.toString('base64url')}.${sign(body).toString('base64url')}`, nonce }
}

export type ConnectStateVerdict =
  | { ok: true; payload: ConnectStatePayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' }

// Verify signature + shape + freshness. Signature is checked FIRST (constant
// time) so nothing unauthenticated is ever parsed into a trusted payload.
export function verifyConnectState(
  stateRaw: string,
  maxAgeMs: number = CONNECT_STATE_MAX_AGE_SECONDS * 1000
): ConnectStateVerdict {
  const parts = stateRaw.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' }

  const body = Buffer.from(parts[0], 'base64url')
  const sig = Buffer.from(parts[1], 'base64url')
  const expected = sign(body)
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return { ok: false, reason: 'bad-signature' }
  }

  let payload: ConnectStatePayload
  try {
    payload = JSON.parse(body.toString('utf8')) as ConnectStatePayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.orgId !== 'string' || !payload.orgId ||
    typeof payload.orgSlug !== 'string' || !payload.orgSlug ||
    typeof payload.nonce !== 'string' || !payload.nonce ||
    typeof payload.ts !== 'number' || !Number.isFinite(payload.ts)
  ) {
    return { ok: false, reason: 'malformed' }
  }

  const age = Date.now() - payload.ts
  if (age > maxAgeMs || age < -CLOCK_SKEW_MS) return { ok: false, reason: 'expired' }

  return { ok: true, payload }
}
