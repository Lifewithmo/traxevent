/**
 * The server-side capacity guard's typed rejection (increment 4).
 *
 * Lives in a plain module (NOT the `'use server'` `actions/leads.ts`) because a
 * `'use server'` file may export only async functions — a class export breaks
 * `next build` (same rule as the LeadUpdate type note in actions/leads.ts). The
 * action imports and throws this; clients detect it and re-call with override.
 *
 * CROSS-BOUNDARY DETECTION. A server action reconstructs a thrown error on the
 * client — the class prototype is gone and custom own-props (`code`/`name`) are
 * not guaranteed to survive serialization; the `message` is the one field that
 * reliably crosses. So the message carries a leading `MARKER`, and detection
 * matches on ANY of `code` / `name` / the message marker. `capacityGuardMessage`
 * strips the marker so the operator sees only the human confirm copy.
 */
export const CAPACITY_GUARD_CODE = 'capacity_guard' as const
const MARKER = '[capacity-guard]'

export class CapacityGuardError extends Error {
  readonly code = CAPACITY_GUARD_CODE
  constructor(message: string) {
    super(`${MARKER} ${message}`)
    this.name = 'CapacityGuardError'
  }
}

/** True when a caught value is a capacity-guard rejection (see the module note). */
export function isCapacityGuardError(err: unknown): err is { message: string } {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; name?: unknown; message?: unknown }
  if (e.code === CAPACITY_GUARD_CODE || e.name === 'CapacityGuardError') return true
  return typeof e.message === 'string' && e.message.startsWith(MARKER)
}

/** The human confirm copy for a guard rejection, with the detection marker stripped. */
export function capacityGuardMessage(err: unknown): string {
  const raw = (err as { message?: unknown })?.message
  const msg = typeof raw === 'string' ? raw : ''
  return msg.startsWith(MARKER) ? msg.slice(MARKER.length).trim() : msg
}
