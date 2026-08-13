import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// Model configuration. Back on claude-opus-5 (2026-08-12, redesign spec §4):
// the 2026-08-08 Sonnet downgrade was a latency fix, now solved by streaming
// + effort=medium instead (Opus 5 low/medium punches above prior models'
// high). Thinking stays OMITTED (adaptive by default on Opus 5). Opus 5 also
// restores the server-side refusal fallback ('default' mode routes by
// refusal category) and drops the prompt-cache minimum to 512 tokens.
export const AI_MODEL = 'claude-opus-5'
// 32000: on Opus 5 thinking is on by default and max_tokens caps thinking +
// output *together*, so headroom has to cover both, not just the visible
// JSON draft. Both call sites (the streaming route and finalMessage()) read
// the response as a stream, so raising this does not risk an HTTP timeout.
export const AI_MAX_TOKENS = 32000
export const AI_EFFORT = 'medium' as const
export const AI_FALLBACKS: 'default' | null = 'default'
export const AI_BETAS: string[] = ['server-side-fallback-2026-07-01']

let client: Anthropic | null = null

export function isAiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function getAnthropicClient(): Anthropic {
  if (!isAiEnabled()) throw new Error('AI is not configured')
  if (!client) client = new Anthropic()
  return client
}
