import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDraftStream } from '@/components/admin/proposal-builder/useDraftStream'

function ndjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('useDraftStream', () => {
  it('streams a live preview then lands on done with the final draft', async () => {
    const line1 = JSON.stringify({
      type: 'delta',
      text: '{"blocks":[{"id":"a","type":"heading","text":"Hi","level":2}',
    })
    const finalDraft = {
      blocks: [{ id: 'a', type: 'heading', text: 'Hi', level: 2 }],
      suggested_packages: [],
      suggested_line_items: [],
      rationale: '',
      adjustments: [],
    }
    const line2 = JSON.stringify({ type: 'final', draft: finalDraft })

    global.fetch = vi.fn().mockResolvedValue(ndjsonResponse([line1, line2]))

    const { result } = renderHook(() => useDraftStream())
    expect(result.current.state.status).toBe('idle')

    await act(async () => {
      await result.current.generate({ orgId: 'o1', proposalId: 'p1', notes: 'notes' })
    })

    await waitFor(() => expect(result.current.state.status).toBe('done'))
    expect(result.current.state).toEqual({ status: 'done', draft: finalDraft })
  })

  it('captures preview blocks while streaming before the final message arrives', async () => {
    const line1 = JSON.stringify({
      type: 'delta',
      text: '{"blocks":[{"id":"a","type":"heading","text":"Hi","level":2}',
    })
    let resolveSecondChunk: () => void = () => {}
    const gate = new Promise<void>((resolve) => { resolveSecondChunk = resolve })

    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(line1 + '\n'))
        await gate
        controller.enqueue(encoder.encode(JSON.stringify({
          type: 'final',
          draft: { blocks: [], suggested_packages: [], suggested_line_items: [], rationale: '', adjustments: [] },
        }) + '\n'))
        controller.close()
      },
    })
    global.fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useDraftStream())
    let genPromise!: Promise<void>
    act(() => {
      genPromise = result.current.generate({ orgId: 'o1', proposalId: 'p1', notes: 'notes' })
    })

    await waitFor(() => {
      expect(result.current.state.status).toBe('streaming')
      const block = result.current.state.status === 'streaming' ? result.current.state.previewBlocks[0] : undefined
      expect(block && 'text' in block ? block.text : undefined).toBe('Hi')
    })

    resolveSecondChunk()
    await act(async () => { await genPromise })
    await waitFor(() => expect(result.current.state.status).toBe('done'))
  })

  it('transitions to error on an error event', async () => {
    const line = JSON.stringify({ type: 'error', message: 'Draft too long — shorten your notes.' })
    global.fetch = vi.fn().mockResolvedValue(ndjsonResponse([line]))

    const { result } = renderHook(() => useDraftStream())
    await act(async () => {
      await result.current.generate({ orgId: 'o1', proposalId: 'p1', notes: 'notes' })
    })

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toEqual({ status: 'error', message: 'Draft too long — shorten your notes.' })
  })

  it('transitions to error on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'))

    const { result } = renderHook(() => useDraftStream())
    await act(async () => {
      await result.current.generate({ orgId: 'o1', proposalId: 'p1', notes: 'notes' })
    })

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toEqual({ status: 'error', message: 'Network down' })
  })

  it('resets to idle', async () => {
    const line = JSON.stringify({ type: 'error', message: 'boom' })
    global.fetch = vi.fn().mockResolvedValue(ndjsonResponse([line]))

    const { result } = renderHook(() => useDraftStream())
    await act(async () => {
      await result.current.generate({ orgId: 'o1', proposalId: 'p1', notes: 'notes' })
    })
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    act(() => result.current.reset())
    expect(result.current.state).toEqual({ status: 'idle' })
  })
})
