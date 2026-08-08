import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// Model configuration. The spec pinned claude-opus-5; switched to
// claude-sonnet-5 (2026-08-08, user call) for latency — drafts were taking
// 20-45s and Sonnet 5 is markedly faster at ~40% of the price with near-Opus
// drafting quality. Thinking stays deliberately OMITTED from requests: on
// both models the default is adaptive thinking, which is what drafting
// wants. max_tokens caps thinking + output together. Note Sonnet 5's prompt-
// cache minimum is 1024 tokens (vs 512 on Opus 5), so a small org catalog
// may fall below the cacheable threshold — harmless, just uncached.
export const AI_MODEL = 'claude-sonnet-5'
export const AI_MAX_TOKENS = 16000
export const AI_EFFORT = 'high' as const
// Safety classifiers can decline a request with HTTP 200 + stop_reason
// 'refusal'. On Opus-tier models, fallbacks: "default" (gated by the
// server-side-fallback beta) reroutes declined requests server-side; Sonnet 5
// does NOT support the parameter (verified live 2026-08-08: 400 "'claude-
// sonnet-5' does not support the `fallbacks` parameter"). AI_FALLBACKS is
// null on Sonnet — a refusal simply surfaces through parseDraftResponse's
// existing message. Switching AI_MODEL back to an Opus-tier model should set
// AI_FALLBACKS = 'default' and restore the beta.
export const AI_FALLBACKS: 'default' | null = null
export const AI_BETAS: string[] = []

let client: Anthropic | null = null

export function isAiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function getAnthropicClient(): Anthropic {
  if (!isAiEnabled()) throw new Error('AI is not configured')
  if (!client) client = new Anthropic()
  return client
}
