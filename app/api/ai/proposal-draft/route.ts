import { getAnthropicClient } from '@/lib/ai/client'
import { prepareDraftRequest, finalizeDraft } from '@/lib/ai/draft-service'

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

  // Auth note: prepareDraftRequest calls assertOrgAdmin(orgId) internally, so
  // this route is protected exactly like the generateProposalDraft action.
  let bundle
  try {
    bundle = await prepareDraftRequest(orgId, proposalId, notes)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const anthropicStream = getAnthropicClient().beta.messages.stream(bundle.requestParams)
        anthropicStream.on('text', (delta: string) => send({ type: 'delta', text: delta }))
        const message = await anthropicStream.finalMessage()
        const draft = await finalizeDraft(orgId, message)
        send({ type: 'final', draft })
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Draft generation failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}
