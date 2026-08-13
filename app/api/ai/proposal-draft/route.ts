import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '@/lib/ai/client'
import { prepareDraftRequest, finalizeDraft } from '@/lib/ai/draft-service'

const MAX_NOTES_LENGTH = 20000

// Streaming NDJSON protocol: {"type":"delta","text":"..."} events while the
// model generates, then a single {"type":"final","draft":ProposalDraft} or
// {"type":"error","message":"..."}. The client accumulates deltas for a live
// preview only (via extractStreamedBlocks) and applies exclusively the final
// draft — atomicity is preserved exactly as in the non-streaming action.
export async function POST(req: Request): Promise<Response> {
  const { orgId, proposalId, notes } = (await req.json()) as { orgId?: string; proposalId?: string; notes?: string }
  if (!orgId || !proposalId || typeof notes !== 'string') {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return Response.json({ error: `Notes are too long (max ${MAX_NOTES_LENGTH} characters).` }, { status: 400 })
  }

  // Auth note: prepareDraftRequest calls assertOrgAdmin(orgId) internally, so
  // this route is protected exactly like the generateProposalDraft action.
  // assertOrgMember/assertOrgAdmin throw 'Unauthorized' (no session) or
  // 'Forbidden' (session but not an admin of orgId) — map those to 401/403;
  // anything else from prepareDraftRequest (bad notes, missing proposal) is a
  // 400 shape error.
  let bundle
  try {
    bundle = await prepareDraftRequest(orgId, proposalId, notes)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return Response.json({ error: message }, { status })
  }

  const encoder = new TextEncoder()
  // Hoisted so `cancel()` (invoked when the client aborts/disconnects) can
  // reach the in-flight Anthropic stream and abort it — otherwise Opus keeps
  // generating (token spend) after nobody is listening.
  let anthropicStream: ReturnType<Anthropic['beta']['messages']['stream']> | null = null
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (cancelled) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // controller was cancelled between our check and the enqueue call
        }
      }
      try {
        anthropicStream = getAnthropicClient().beta.messages.stream(bundle.requestParams)
        anthropicStream.on('text', (delta: string) => send({ type: 'delta', text: delta }))
        const message = await anthropicStream.finalMessage()
        if (cancelled) return
        const draft = await finalizeDraft(orgId, message)
        send({ type: 'final', draft })
      } catch (e) {
        if (!cancelled) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'Draft generation failed' })
        }
      } finally {
        if (!cancelled) {
          try {
            controller.close()
          } catch {
            // already closed/cancelled
          }
        }
      }
    },
    cancel() {
      cancelled = true
      anthropicStream?.abort()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}
