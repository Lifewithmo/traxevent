import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks are hoisted, so build the fake Anthropic stream + spies at module
// scope via vi.hoisted rather than importing draft-service's real Firestore
// dependencies — this route test is only about the route's own framing
// (status codes, notes bound, and abort wiring), not draft assembly, which
// prepareDraftRequest/finalizeDraft already cover in proposal-ai.test.ts.
const { prepareDraftRequest, finalizeDraft, streamFn, abortSpy, makeFakeStream } = vi.hoisted(() => {
  const abortSpy = vi.fn()

  function makeFakeStream() {
    let textListener: ((delta: string) => void) | null = null
    let resolveFinal: (v: unknown) => void = () => {}
    let rejectFinal: (e: unknown) => void = () => {}
    const finalPromise = new Promise((resolve, reject) => {
      resolveFinal = resolve
      rejectFinal = reject
    })
    const stream = {
      on(event: string, cb: (delta: string) => void) {
        if (event === 'text') textListener = cb
        return stream
      },
      finalMessage: () => finalPromise,
      abort: abortSpy,
      // test helpers, not part of the real SDK surface
      emit(delta: string) { textListener?.(delta) },
      resolve: (v: unknown) => resolveFinal(v),
      reject: (e: unknown) => rejectFinal(e),
    }
    return stream
  }

  return {
    prepareDraftRequest: vi.fn(),
    finalizeDraft: vi.fn(),
    streamFn: vi.fn(),
    abortSpy,
    makeFakeStream,
  }
})

vi.mock('@/lib/ai/draft-service', () => ({ prepareDraftRequest, finalizeDraft }))
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({ beta: { messages: { stream: streamFn } } }),
}))

import { POST } from '@/app/api/ai/proposal-draft/route'

function req(body: unknown) {
  return new Request('http://localhost/api/ai/proposal-draft', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function readAllLines(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const events: Array<Record<string, unknown>> = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
  }
  for (const line of buf.split('\n')) {
    if (line.trim()) events.push(JSON.parse(line))
  }
  return events
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/ai/proposal-draft', () => {
  it('400s on a malformed body (missing orgId/proposalId/notes)', async () => {
    const res = await POST(req({ orgId: 'o1' }))
    expect(res.status).toBe(400)
    expect(prepareDraftRequest).not.toHaveBeenCalled()
  })

  it('400s when notes exceed the 20000-char bound, before calling prepareDraftRequest', async () => {
    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'x'.repeat(20001) }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/too long/i)
    expect(prepareDraftRequest).not.toHaveBeenCalled()
  })

  it('accepts notes at exactly the 20000-char bound', async () => {
    const fake = makeFakeStream()
    streamFn.mockReturnValue(fake)
    prepareDraftRequest.mockResolvedValue({ requestParams: {}, proposal: {} })
    finalizeDraft.mockResolvedValue({ blocks: [] })
    fake.resolve({ usage: {} })
    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'x'.repeat(20000) }))
    expect(res.status).toBe(200)
    expect(prepareDraftRequest).toHaveBeenCalled()
  })

  it('401s when the caller is unauthenticated (assertOrgAdmin throws "Unauthorized")', async () => {
    prepareDraftRequest.mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('403s when the caller is authenticated but not an org admin ("Forbidden")', async () => {
    prepareDraftRequest.mockRejectedValue(new Error('Forbidden'))
    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    expect(res.status).toBe(403)
  })

  it('400s for other prepareDraftRequest failures (shape errors like a missing proposal)', async () => {
    prepareDraftRequest.mockRejectedValue(new Error('Proposal not found'))
    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Proposal not found')
  })

  it('streams delta events then a final draft', async () => {
    const fake = makeFakeStream()
    streamFn.mockReturnValue(fake)
    prepareDraftRequest.mockResolvedValue({ requestParams: {}, proposal: {} })
    finalizeDraft.mockResolvedValue({ blocks: [{ id: 'b1', type: 'paragraph', text: 'hi' }] })

    const resPromise = POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    const res = await resPromise
    // Emit a delta, then resolve finalMessage — mirrors the real SDK's timing.
    fake.emit('chunk')
    fake.resolve({ usage: { input_tokens: 1, output_tokens: 1 } })

    const events = await readAllLines(res)
    expect(events).toContainEqual({ type: 'delta', text: 'chunk' })
    expect(events).toContainEqual({ type: 'final', draft: { blocks: [{ id: 'b1', type: 'paragraph', text: 'hi' }] } })
  })

  it('an error thrown mid-stream is surfaced as an error event', async () => {
    const fake = makeFakeStream()
    streamFn.mockReturnValue(fake)
    prepareDraftRequest.mockResolvedValue({ requestParams: {}, proposal: {} })
    fake.reject(new Error('model refused'))

    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    const events = await readAllLines(res)
    expect(events).toContainEqual({ type: 'error', message: 'model refused' })
  })

  // Cancellation (final-review finding): an abandoned request (client
  // navigates away / component unmounts) must abort the underlying Anthropic
  // stream rather than let Opus keep generating for nobody.
  it('cancelling the response stream aborts the underlying Anthropic stream', async () => {
    const fake = makeFakeStream()
    streamFn.mockReturnValue(fake)
    prepareDraftRequest.mockResolvedValue({ requestParams: {}, proposal: {} })
    // finalMessage() deliberately left unresolved — the client cancels before
    // the model ever finishes.

    const res = await POST(req({ orgId: 'o1', proposalId: 'p1', notes: 'hi' }))
    const reader = res.body!.getReader()
    await reader.cancel()

    expect(abortSpy).toHaveBeenCalled()
  })
})
