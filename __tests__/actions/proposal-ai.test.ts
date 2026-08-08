import { describe, it, expect, vi, beforeEach } from 'vitest'

const assertOrgAdmin = vi.fn()
vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: (...a: unknown[]) => assertOrgAdmin(...a),
  assertOrgMember: vi.fn(),
}))

const proposalGet = vi.fn()
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ get: proposalGet }) }) }),
    }),
  },
}))

const listWorkPackagesCore = vi.fn()
vi.mock('@/lib/ops/work-packages', () => ({
  listWorkPackagesCore: (...a: unknown[]) => listWorkPackagesCore(...a),
}))
const listResourcesCore = vi.fn()
vi.mock('@/lib/ops/resources', () => ({
  listResourcesCore: (...a: unknown[]) => listResourcesCore(...a),
}))

interface StreamRequest {
  model: string
  max_tokens: number
  betas: string[]
  fallbacks: string
  thinking?: unknown
  output_config: { effort: string; format: { type: string; schema: unknown } }
  system: Array<{ type: string; text: string; cache_control?: { type: string } }>
  messages: unknown[]
}

const finalMessage = vi.fn()
// Typed with an explicit param (vs. `() => ...`) so `.mock.calls[0][0]` below
// isn't inferred as an empty tuple under strict mode.
const streamFn = vi.fn((_req: StreamRequest) => ({ finalMessage }))
vi.mock('@/lib/ai/client', () => ({
  isAiEnabled: () => true,
  getAnthropicClient: () => ({ beta: { messages: { stream: streamFn } } }),
  AI_MODEL: 'claude-opus-5',
  AI_MAX_TOKENS: 16000,
  AI_EFFORT: 'high',
  AI_BETAS: ['server-side-fallback-2026-07-01'],
}))

const logAiUsage = vi.fn()
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: (...a: unknown[]) => logAiUsage(...a) }))

import { generateProposalDraft } from '@/actions/proposal-ai'

const DRAFT_JSON = JSON.stringify({
  blocks: [{ id: 'b1', type: 'paragraph', text: 'Hello' }],
  suggested_packages: [{
    name: 'Standard bar',
    recommended: true,
    items: [
      { description: 'Setup', quantity: 1, unit_price: 250 },
      { description: 'Bartender', quantity: 5, unit_price: 60 },
      { description: 'Glassware', quantity: 1, unit_price: 120, optional: true },
    ],
  }],
  rationale: 'why',
})

beforeEach(() => {
  vi.clearAllMocks()
  assertOrgAdmin.mockResolvedValue({ role: 'admin' })
  proposalGet.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', lead_id: 'l1', status: 'draft' }) })
  listWorkPackagesCore.mockResolvedValue([{ id: 'wp-a', name: 'A', price: 100, lines: [], created_at: 'x' }])
  listResourcesCore.mockResolvedValue([])
  finalMessage.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: DRAFT_JSON }],
    usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 100 },
  })
})

describe('generateProposalDraft', () => {
  it('requires org admin before doing anything', async () => {
    assertOrgAdmin.mockRejectedValue(new Error('Not authorized'))
    await expect(generateProposalDraft('o1', 'p1', 'notes')).rejects.toThrow('Not authorized')
    expect(streamFn).not.toHaveBeenCalled()
  })

  it('rejects empty notes without calling the model', async () => {
    await expect(generateProposalDraft('o1', 'p1', '   ')).rejects.toThrow(/notes/i)
    expect(streamFn).not.toHaveBeenCalled()
  })

  it('throws when the proposal does not exist', async () => {
    proposalGet.mockResolvedValue({ exists: false })
    await expect(generateProposalDraft('o1', 'p1', 'notes')).rejects.toThrow('Proposal not found')
    expect(streamFn).not.toHaveBeenCalled()
  })

  it('sends the spec-fixed request shape', async () => {
    await generateProposalDraft('o1', 'p1', 'call notes here')
    const req = streamFn.mock.calls[0][0]
    expect(req.model).toBe('claude-opus-5')
    expect(req.max_tokens).toBe(16000)
    expect(req.fallbacks).toBe('default')
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(req.thinking).toBeUndefined()
    expect(req.output_config.effort).toBe('high')
    expect(req.output_config.format.type).toBe('json_schema')
    expect(req.system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(JSON.stringify(req.messages)).toContain('call notes here')
  })

  it('returns the parsed draft with server-minted composed packages and pool items', async () => {
    const r = await generateProposalDraft('o1', 'p1', 'notes')
    expect(r.blocks).toHaveLength(1)
    expect(r.adjustments).toEqual([])
    expect(r.suggested_line_items).toHaveLength(3)
    expect(r.suggested_packages).toHaveLength(1)

    const pkg = r.suggested_packages[0]
    expect(pkg).toMatchObject({ name: 'Standard bar', recommended: true, includes: [] })
    expect(pkg.price).toBe(250 + 300) // member sum only; no override from AI
    expect(pkg.price_override).toBeUndefined()

    // every id is server-minted (ai- prefix), unique, and members resolve
    const ids = r.suggested_line_items.map((i) => i.id as string)
    expect(new Set(ids).size).toBe(3)
    for (const id of [...ids, pkg.id]) expect(id).toMatch(/^ai-[0-9a-f]{8}$/)
    expect(pkg.item_ids).toHaveLength(2)
    for (const ref of pkg.item_ids!) expect(ids).toContain(ref)
    const optional = r.suggested_line_items.find((i) => i.description === 'Glassware')
    expect(optional?.optional).toBe(true)
    expect(pkg.item_ids).not.toContain(optional!.id)
  })

  it('logs usage with the proposal_draft feature tag', async () => {
    await generateProposalDraft('o1', 'p1', 'notes')
    expect(logAiUsage).toHaveBeenCalledWith('o1', 'proposal_draft', {
      input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 100,
    })
  })

  it('surfaces refusal as a clear error and still logs usage', async () => {
    finalMessage.mockResolvedValue({
      stop_reason: 'refusal', content: [],
      usage: { input_tokens: 500, output_tokens: 0, cache_read_input_tokens: 0 },
    })
    await expect(generateProposalDraft('o1', 'p1', 'notes')).rejects.toThrow(/declined/i)
    expect(logAiUsage).toHaveBeenCalled()
  })

  it('writes nothing to the proposal document', async () => {
    // proposalGet's ref has no update/set in the mock — reaching for one would throw.
    await expect(generateProposalDraft('o1', 'p1', 'notes')).resolves.toBeTruthy()
  })
})
