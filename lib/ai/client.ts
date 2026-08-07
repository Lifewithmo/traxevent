import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// Spec-fixed model configuration (2026-08-06 presentation spec § Increment 2,
// carried into the 2026-08-07 operator-ai spec). Thinking is deliberately
// OMITTED from requests: on claude-opus-5 the default is adaptive thinking,
// which is what drafting wants. max_tokens caps thinking + output together.
export const AI_MODEL = 'claude-opus-5'
export const AI_MAX_TOKENS = 16000
export const AI_EFFORT = 'high' as const
// Opus 5's safety classifiers can decline a request with HTTP 200 +
// stop_reason 'refusal'. fallbacks: "default" (gated by this beta) reroutes
// declined requests server-side by refusal category.
export const AI_BETAS = ['server-side-fallback-2026-07-01']

let client: Anthropic | null = null

export function isAiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function getAnthropicClient(): Anthropic {
  if (!isAiEnabled()) throw new Error('AI is not configured')
  if (!client) client = new Anthropic()
  return client
}
