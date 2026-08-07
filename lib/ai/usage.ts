import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'

export interface AiUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
}

// App-level logging is the only observability (no gateway), and this
// collection is the future billing/plan-gating hook. Best-effort by design:
// a failed usage write must never fail the generation the operator is
// waiting on.
export async function logAiUsage(orgId: string, feature: string, usage: AiUsage): Promise<void> {
  try {
    const id = randomBytes(8).toString('hex')
    await adminDb
      .collection('orgs').doc(orgId)
      .collection('ai_usage').doc(id)
      .set({
        feature,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        created_at: new Date().toISOString(),
      })
  } catch {
    // swallow — observability must not break the feature it observes
  }
}
