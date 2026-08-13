'use client'

// Client-side driver for the streaming NDJSON draft protocol (Task 4's
// POST /api/ai/proposal-draft). Two buffers are kept deliberately separate:
// `network` accumulates raw bytes split on '\n' to recover whole NDJSON
// lines (the trailing partial line is held back for the next chunk); `text`
// accumulates only the delta *payloads* — the partial structured-output JSON
// the model is generating — and is fed to extractStreamedBlocks for a
// best-effort live preview. Nothing derived from the preview is ever applied;
// only the final `draft` from the `final` event is authoritative.
import { useCallback, useRef, useState } from 'react'
import { extractStreamedBlocks } from '@/lib/ai/stream-draft'
import type { ProposalDraft } from '@/lib/ai/proposal-draft'
import type { ProposalBlock } from '@/lib/types'

export type DraftStreamState =
  | { status: 'idle' }
  | { status: 'streaming'; previewBlocks: ProposalBlock[] }
  | { status: 'done'; draft: ProposalDraft }
  | { status: 'error'; message: string }

type NdjsonEvent =
  | { type: 'delta'; text: string }
  | { type: 'final'; draft: ProposalDraft }
  | { type: 'error'; message: string }

export function useDraftStream(): {
  state: DraftStreamState
  generate: (args: { orgId: string; proposalId: string; notes: string }) => Promise<void>
  reset: () => void
} {
  const [state, setState] = useState<DraftStreamState>({ status: 'idle' })

  const generate = useCallback(async (args: { orgId: string; proposalId: string; notes: string }) => {
    setState({ status: 'streaming', previewBlocks: [] })
    let text = ''
    try {
      const res = await fetch('/api/ai/proposal-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!res.ok || !res.body) {
        let message = `Request failed (${res.status})`
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) message = body.error
        } catch { /* non-JSON error body; keep default message */ }
        setState({ status: 'error', message })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let network = ''
      let settled = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        network += decoder.decode(value, { stream: true })
        const lines = network.split('\n')
        network = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as NdjsonEvent
          if (event.type === 'delta') {
            text += event.text
            setState({ status: 'streaming', previewBlocks: extractStreamedBlocks(text) })
          } else if (event.type === 'final') {
            setState({ status: 'done', draft: event.draft })
            settled = true
          } else if (event.type === 'error') {
            setState({ status: 'error', message: event.message })
            settled = true
          }
        }
      }

      if (!settled) {
        setState({ status: 'error', message: 'The draft stream ended unexpectedly.' })
      }
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Draft generation failed' })
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, generate, reset }
}
