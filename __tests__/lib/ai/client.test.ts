// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY

describe('lib/ai/client', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
  })

  it('isAiEnabled is false when the key is unset or empty', async () => {
    delete process.env.ANTHROPIC_API_KEY
    let mod = await import('@/lib/ai/client')
    expect(mod.isAiEnabled()).toBe(false)
    process.env.ANTHROPIC_API_KEY = ''
    vi.resetModules()
    mod = await import('@/lib/ai/client')
    expect(mod.isAiEnabled()).toBe(false)
  })

  it('isAiEnabled is true when the key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const mod = await import('@/lib/ai/client')
    expect(mod.isAiEnabled()).toBe(true)
  })

  it('getAnthropicClient throws a clear error when unconfigured', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const mod = await import('@/lib/ai/client')
    expect(() => mod.getAnthropicClient()).toThrow('AI is not configured')
  })

  it('getAnthropicClient returns the same instance on repeat calls', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const mod = await import('@/lib/ai/client')
    expect(mod.getAnthropicClient()).toBe(mod.getAnthropicClient())
  })

  it('exports the spec-fixed model configuration', async () => {
    const mod = await import('@/lib/ai/client')
    expect(mod.AI_MODEL).toBe('claude-opus-5')
    expect(mod.AI_MAX_TOKENS).toBe(16000)
    expect(mod.AI_EFFORT).toBe('high')
    expect(mod.AI_BETAS).toEqual(['server-side-fallback-2026-07-01'])
  })
})
