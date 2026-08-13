# Proposal Builder Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the proposal builder's right rail with a command bar + fully in-context canvas, make AI drafting the mainline creation path (Opus 5, streaming, voice few-shot), and add a Review & Send flow.

**Architecture:** The rail (`RightRail.tsx`) is deleted. Lifecycle/status moves into a grown `TopBar` (command bar). Client-visible settings (discount/tax/deposit/expiry/notes) move onto the canvas as an editable Totals section using the existing popover idiom. AI drafting moves to a streaming route handler + composer modal/hero seeded by voice examples captured on every send. Send becomes a pre-flight dialog.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing route/page code — this Next version has breaking changes), React client components, shadcn-style primitives in `components/ui` (button/dialog/input/label/badge only — there is NO Sheet, NO dropdown-menu, NO toast lib; hand-roll popovers/menus like `PricingCanvas` does), Firestore via `adminDb`, Anthropic SDK (`@anthropic-ai/sdk`), Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-proposal-builder-redesign-design.md`.
- AI model: `claude-opus-5`, `output_config.effort: "medium"`, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Voice examples: cap **3**, newest first, deduped by `proposal_id`, stored at Firestore doc `orgs/{orgId}/ai_voice/examples`.
- Optional org voice note field name: `ai_voice_note` (top-level on `Org`, NOT inside `OrgBranding` — branding ships verbatim to public pages).
- No new UI dependencies. No `sonner`, no Radix additions.
- `'use server'` modules must never re-export types (`next build` breaks; tsc passes) — keep types in `lib/`.
- Run vitest from the primary checkout with `--exclude '**/.claude/**'` (sibling worktrees pollute the run otherwise).
- A task is done only when `npx vitest run --exclude '**/.claude/**'` passes; the final task also requires `npx next build`.
- Locked proposals (`signature`/`pending_signature`/`voided`) render read-only everywhere; never autosave while locked.
- Client-visible strings: "Draft this proposal from your notes", "Fill with AI", "Fill remaining with AI", "Send to client…", "Copy client link", "How we sound".

---

### Task 1: AI engine config — Opus 5, medium effort, server-side fallbacks

**Files:**
- Modify: `lib/ai/client.ts`
- Test: `__tests__/lib/ai/client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AI_MODEL = 'claude-opus-5'`, `AI_EFFORT = 'medium'`, `AI_FALLBACKS = 'default'`, `AI_BETAS = ['server-side-fallback-2026-07-01']`, `AI_MAX_TOKENS = 16000` (unchanged). `actions/proposal-ai.ts` already spreads `...(AI_FALLBACKS ? { betas: AI_BETAS, fallbacks: AI_FALLBACKS } : {})` — no change needed there yet.

- [ ] **Step 1: Update the failing tests first.** Open `__tests__/lib/ai/client.test.ts`, change every assertion on the constants to the new values:

```ts
expect(AI_MODEL).toBe('claude-opus-5')
expect(AI_EFFORT).toBe('medium')
expect(AI_FALLBACKS).toBe('default')
expect(AI_BETAS).toEqual(['server-side-fallback-2026-07-01'])
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run __tests__/lib/ai/client.test.ts --exclude '**/.claude/**'` — expect FAIL (constants still Sonnet).

- [ ] **Step 3: Implement.** In `lib/ai/client.ts` replace the constants block and rewrite the two comments (they currently explain the Sonnet downgrade and Sonnet's lack of fallbacks — both now stale):

```ts
// Model configuration. Back on claude-opus-5 (2026-08-12, redesign spec §4):
// the 2026-08-08 Sonnet downgrade was a latency fix, now solved by streaming
// + effort=medium instead (Opus 5 low/medium punches above prior models'
// high). Thinking stays OMITTED (adaptive by default on Opus 5). Opus 5 also
// restores the server-side refusal fallback ('default' mode routes by
// refusal category) and drops the prompt-cache minimum to 512 tokens.
export const AI_MODEL = 'claude-opus-5'
export const AI_MAX_TOKENS = 16000
export const AI_EFFORT = 'medium' as const
export const AI_FALLBACKS: 'default' | null = 'default'
export const AI_BETAS: string[] = ['server-side-fallback-2026-07-01']
```

- [ ] **Step 4: Run to verify pass.** Same command — expect PASS. Also run `npx vitest run __tests__/actions/proposal-ai.test.ts --exclude '**/.claude/**'` (its mocks may assert the model string; update them to `claude-opus-5` if so).

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(ai): opus 5 at medium effort with server-side refusal fallback"`

---

### Task 2: Voice capture — pure helpers + capture on send

**Files:**
- Create: `lib/ai/voice.ts`
- Modify: `actions/proposals.ts` (sendProposal)
- Test: `__tests__/lib/ai/voice.test.ts`

**Interfaces:**
- Consumes: `ProposalBlock` from `lib/types`.
- Produces (used by Tasks 3 and 4):

```ts
// lib/ai/voice.ts — pure, no DB imports (mirrors lib/ai/grounding.ts)
export interface VoiceExample {
  proposal_id: string
  title: string
  text: string       // plain text distilled from the sent blocks
  sent_at: string    // ISO
}
export const MAX_VOICE_EXAMPLES = 3
export function blocksToVoiceText(blocks: ProposalBlock[]): string
export function pushVoiceExample(existing: VoiceExample[], next: VoiceExample): VoiceExample[]
export function serializeVoice(examples: VoiceExample[], note?: string): string | null
```

Firestore doc `orgs/{orgId}/ai_voice/examples` shape: `{ examples: VoiceExample[] }`.

- [ ] **Step 1: Write failing tests** in `__tests__/lib/ai/voice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { blocksToVoiceText, pushVoiceExample, serializeVoice, MAX_VOICE_EXAMPLES } from '@/lib/ai/voice'
import type { ProposalBlock } from '@/lib/types'

const blocks: ProposalBlock[] = [
  { id: '1', type: 'heading', text: 'What we bring', level: 2 },
  { id: '2', type: 'paragraph', text: 'A full espresso bar with two baristas.' },
  { id: '3', type: 'list', items: ['Three-hour window', 'Oat and whole milk'] },
  { id: '4', type: 'testimonial', quote: 'People loved it.', attribution: 'Dana W.' },
  { id: '5', type: 'paragraph', text: 'Hidden', placeholder: true } as ProposalBlock,
  { id: '6', type: 'image', url: 'https://x/y.png' } as ProposalBlock,
]

describe('blocksToVoiceText', () => {
  it('renders headings, paragraphs, lists, testimonials; skips placeholders and images', () => {
    const text = blocksToVoiceText(blocks)
    expect(text).toContain('What we bring')
    expect(text).toContain('A full espresso bar')
    expect(text).toContain('- Three-hour window')
    expect(text).toContain('"People loved it." — Dana W.')
    expect(text).not.toContain('Hidden')
    expect(text).not.toContain('y.png')
  })
})

describe('pushVoiceExample', () => {
  const ex = (id: string, at: string) => ({ proposal_id: id, title: id, text: 't', sent_at: at })
  it('prepends newest and caps at MAX_VOICE_EXAMPLES', () => {
    const out = pushVoiceExample([ex('a', '1'), ex('b', '2'), ex('c', '3')], ex('d', '4'))
    expect(out.map((e) => e.proposal_id)).toEqual(['d', 'a', 'b'])
    expect(out).toHaveLength(MAX_VOICE_EXAMPLES)
  })
  it('re-sending the same proposal replaces its old example instead of duplicating', () => {
    const out = pushVoiceExample([ex('a', '1'), ex('b', '2')], ex('b', '9'))
    expect(out.map((e) => e.proposal_id)).toEqual(['b', 'a'])
  })
})

describe('serializeVoice', () => {
  it('returns null with no material', () => {
    expect(serializeVoice([], undefined)).toBeNull()
    expect(serializeVoice([], '   ')).toBeNull()
  })
  it('includes note and examples', () => {
    const s = serializeVoice([{ proposal_id: 'a', title: 'Launch bar', text: 'Warm prose.', sent_at: '2026-08-01' }], 'no exclamation marks')
    expect(s).toContain('no exclamation marks')
    expect(s).toContain('Launch bar')
    expect(s).toContain('Warm prose.')
  })
})
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run __tests__/lib/ai/voice.test.ts --exclude '**/.claude/**'` — FAIL (module missing).

- [ ] **Step 3: Implement `lib/ai/voice.ts`:**

```ts
// Voice few-shot material (redesign spec §4): pure helpers, no DB imports.
// The org's most recently SENT proposals are ground truth for how the
// operator writes — every human edit to a prior AI draft is baked in.
import type { ProposalBlock } from '@/lib/types'

export interface VoiceExample {
  proposal_id: string
  title: string
  text: string
  sent_at: string
}

export const MAX_VOICE_EXAMPLES = 3
// Guardrail so three long proposals can't blow out the cached prefix.
const MAX_EXAMPLE_CHARS = 4000

export function blocksToVoiceText(blocks: ProposalBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    if ((b as { placeholder?: boolean }).placeholder === true) continue
    if (b.type === 'heading') lines.push(`## ${b.text}`)
    else if (b.type === 'paragraph') lines.push(b.text)
    else if (b.type === 'list') lines.push(...b.items.map((i) => `- ${i}`))
    else if (b.type === 'testimonial') lines.push(`"${b.quote}"${b.attribution ? ` — ${b.attribution}` : ''}`)
    // images and unknown block types carry no voice
  }
  return lines.join('\n').slice(0, MAX_EXAMPLE_CHARS)
}

export function pushVoiceExample(existing: VoiceExample[], next: VoiceExample): VoiceExample[] {
  return [next, ...existing.filter((e) => e.proposal_id !== next.proposal_id)].slice(0, MAX_VOICE_EXAMPLES)
}

export function serializeVoice(examples: VoiceExample[], note?: string): string | null {
  const trimmedNote = note?.trim()
  if (!examples.length && !trimmedNote) return null
  const parts: string[] = ['# Voice (write like the operator)']
  if (trimmedNote) parts.push(`Operator's own description of how they sound: ${trimmedNote}`)
  for (const ex of examples) {
    parts.push(`## Example — "${ex.title}" (sent ${ex.sent_at})\n${ex.text}`)
  }
  parts.push('Match the tone, vocabulary, and sentence rhythm of these examples. Never copy their event-specific facts.')
  return parts.join('\n\n')
}
```

- [ ] **Step 4: Run to verify pass.** Same command — PASS.

- [ ] **Step 5: Capture on send.** In `actions/proposals.ts` `sendProposal`, after the `ref.update({ status: 'sent', ... })` line, add a best-effort capture (never let it fail the send). `data` is already loaded above; guard for the no-snapshot path:

```ts
  // Voice capture (redesign spec §4): the sent document's final text becomes
  // few-shot voice material for future AI drafts. Best-effort — a capture
  // failure must never fail the send.
  try {
    const blocks = (snap?.exists ? ((snap.data() as Proposal).blocks ?? []) : []) as ProposalBlock[]
    const text = blocksToVoiceText(blocks)
    if (text.trim()) {
      const voiceRef = adminDb.collection('orgs').doc(orgId).collection('ai_voice').doc('examples')
      const voiceSnap = await voiceRef.get()
      const existing = (voiceSnap.exists ? (voiceSnap.data()?.examples ?? []) : []) as VoiceExample[]
      const title = (snap?.exists ? (snap.data() as Proposal).title : undefined) ?? 'Untitled proposal'
      await voiceRef.set({
        examples: pushVoiceExample(existing, {
          proposal_id: proposalId,
          title,
          text,
          sent_at: new Date().toISOString(),
        }),
      })
    }
  } catch {
    // non-fatal
  }
```

Add imports: `import { blocksToVoiceText, pushVoiceExample, type VoiceExample } from '@/lib/ai/voice'` and `ProposalBlock` to the existing type import. NOTE: `actions/proposals.ts` is a `'use server'` module — importing types is fine; do NOT re-export any.

- [ ] **Step 6: Run the proposals action tests** (`npx vitest run __tests__/actions --exclude '**/.claude/**'`). If `sendProposal` tests exist with a mocked `adminDb`, extend the mock so `.collection('ai_voice').doc('examples').get()` resolves `{ exists: false }` and `.set` resolves. Expect PASS.

- [ ] **Step 7: Commit.** `git commit -am "feat(ai): capture voice examples from sent proposals"`

---

### Task 3: Voice in the prompt + org "How we sound" field

**Files:**
- Modify: `lib/ai/grounding.ts`, `lib/types.ts` (Org), `actions/orgs.ts`, `actions/proposal-ai.ts`, `app/(admin)/[orgSlug]/branding/page.tsx` (+ its client component, whatever file the branding form lives in)
- Test: `__tests__/lib/ai/grounding.test.ts`

**Interfaces:**
- Consumes: `serializeVoice`, `VoiceExample` from Task 2.
- Produces: `buildDraftSystemBlocks(catalogText: string, voiceText?: string | null): SystemBlock[]` (second param NEW, optional — existing callers compile unchanged); `Org.ai_voice_note?: string`; server action `updateOrgVoiceNote(orgId: string, note: string): Promise<void>`; a `loadVoiceText(orgId)` helper exported from `lib/ai/draft-service.ts` is deferred to Task 4 — in THIS task `actions/proposal-ai.ts` inlines the fetch.

- [ ] **Step 1: Failing test** — add to `__tests__/lib/ai/grounding.test.ts`:

```ts
it('inserts a voice block between the prompt and the cached catalog block', () => {
  const blocks = buildDraftSystemBlocks('CATALOG', 'VOICE MATERIAL')
  expect(blocks).toHaveLength(3)
  expect(blocks[1].text).toContain('VOICE MATERIAL')
  expect(blocks[1].cache_control).toBeUndefined()
  expect(blocks[2].cache_control).toEqual({ type: 'ephemeral' })
})
it('omits the voice block when voice is null/absent', () => {
  expect(buildDraftSystemBlocks('CATALOG')).toHaveLength(2)
  expect(buildDraftSystemBlocks('CATALOG', null)).toHaveLength(2)
})
```

- [ ] **Step 2: Run to verify failure**, then implement in `lib/ai/grounding.ts`:

```ts
export function buildDraftSystemBlocks(catalogText: string, voiceText?: string | null): SystemBlock[] {
  return [
    { type: 'text', text: DRAFT_SYSTEM_PROMPT },
    ...(voiceText ? [{ type: 'text' as const, text: voiceText }] : []),
    // cache_control on the LAST stable block: prompt + voice + catalog cache
    // together; the per-request notes go in the user message after this.
    { type: 'text', text: `# Org catalog (ground truth)\n\n${catalogText}`, cache_control: { type: 'ephemeral' as const } },
  ]
}
```

- [ ] **Step 3: Run to verify pass.**

- [ ] **Step 4: Org field + action.** In `lib/types.ts`, add to `Org` (next to `intake_token`): `ai_voice_note?: string   // optional "How we sound" style note fed to AI drafting`. In `actions/orgs.ts` add:

```ts
/** Save the optional "How we sound" note used by AI proposal drafting. */
export async function updateOrgVoiceNote(orgId: string, note: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const trimmed = typeof note === 'string' ? note.trim().slice(0, 1000) : ''
  await adminDb.collection('orgs').doc(orgId).update({ ai_voice_note: trimmed || FieldValue.delete() })
}
```

(Check how `actions/orgs.ts` imports FieldValue — if `FieldValue` isn't already imported, `import { FieldValue } from 'firebase-admin/firestore'`.)

- [ ] **Step 5: Branding page field.** In the branding form (follow the existing field patterns in `app/(admin)/[orgSlug]/branding/`), add a labeled textarea **"How we sound"** with helper text "Optional. A sentence or two about your writing style — the AI matches it when drafting proposals." Wire it to `updateOrgVoiceNote` following the same save pattern the other branding fields use (the value comes from `Org.ai_voice_note`, passed down from the page's server component).

- [ ] **Step 6: Feed the prompt.** In `actions/proposal-ai.ts`, alongside the existing `Promise.all` for catalog data, also fetch the voice doc and org note, and pass to `buildDraftSystemBlocks`:

```ts
  const [packages, resources, voiceSnap, orgSnap] = await Promise.all([
    listWorkPackagesCore(orgId),
    listResourcesCore(orgId),
    adminDb.collection('orgs').doc(orgId).collection('ai_voice').doc('examples').get(),
    adminDb.collection('orgs').doc(orgId).get(),
  ])
  const examples = (voiceSnap.exists ? (voiceSnap.data()?.examples ?? []) : []) as VoiceExample[]
  const voiceText = serializeVoice(examples, (orgSnap.data() as Org | undefined)?.ai_voice_note)
  ...
  system: buildDraftSystemBlocks(serializeCatalog(packages, resources), voiceText),
```

- [ ] **Step 7: Full test run** (`npx vitest run --exclude '**/.claude/**'`), fix any mock fallout in `__tests__/actions/proposal-ai.test.ts` (the adminDb mock now needs the `ai_voice` doc get + org doc get). PASS.

- [ ] **Step 8: Commit.** `git commit -am "feat(ai): voice few-shot + org 'How we sound' note in draft prompt"`

---

### Task 4: Streaming draft service + route handler

**Files:**
- Create: `lib/ai/draft-service.ts` (server-only orchestration shared by action + route), `lib/ai/stream-draft.ts` (pure incremental block extractor), `app/api/ai/proposal-draft/route.ts`
- Modify: `actions/proposal-ai.ts` (becomes a thin wrapper over draft-service)
- Test: `__tests__/lib/ai/stream-draft.test.ts`

**Interfaces:**
- Consumes: Task 3's `buildDraftSystemBlocks`, `serializeVoice`; existing `parseDraftResponse`, `mintSuggestedPackages`, `logAiUsage`.
- Produces:

```ts
// lib/ai/stream-draft.ts — pure, display-only best-effort extraction
export function extractStreamedBlocks(partialJson: string): ProposalBlock[]

// lib/ai/draft-service.ts ('server-only', NOT 'use server')
export interface DraftRequestBundle {
  requestParams: /* full params object for client.beta.messages.stream */
  proposal: Proposal
}
export async function prepareDraftRequest(orgId: string, proposalId: string, notes: string, modelOverride?: string): Promise<DraftRequestBundle>
export async function finalizeDraft(orgId: string, message: DraftMessage & { usage: ... }): Promise<ProposalDraft>
```

Route protocol (`POST /api/ai/proposal-draft`, body `{ orgId, proposalId, notes }`): newline-delimited JSON events —
`{"type":"delta","text":"<raw text delta>"}` … `{"type":"final","draft":<ProposalDraft>}` or `{"type":"error","message":"..."}`. Client accumulates deltas, runs `extractStreamedBlocks` for live preview, and only ever *applies* the `final` draft (atomicity preserved).

- [ ] **Step 1: Failing tests** for the extractor in `__tests__/lib/ai/stream-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractStreamedBlocks } from '@/lib/ai/stream-draft'

describe('extractStreamedBlocks', () => {
  it('returns [] before the blocks array opens', () => {
    expect(extractStreamedBlocks('{"bl')).toEqual([])
  })
  it('returns each complete block object, ignoring the trailing partial', () => {
    const partial = '{"blocks":[{"id":"a","type":"heading","text":"Hi","level":2},{"id":"b","type":"paragraph","text":"Wor'
    const out = extractStreamedBlocks(partial)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'heading', text: 'Hi' })
  })
  it('handles nested braces and escaped quotes inside strings', () => {
    const partial = '{"blocks":[{"id":"a","type":"paragraph","text":"a \\"quote\\" and {brace}"} , {"id":"b"'
    const out = extractStreamedBlocks(partial)
    expect(out).toHaveLength(1)
    expect((out[0] as { text: string }).text).toContain('"quote"')
  })
  it('stops at the end of the blocks array', () => {
    const full = '{"blocks":[{"id":"a","type":"paragraph","text":"x"}],"suggested_packages":[{"name":"n","items":[]}],"rationale":"r"}'
    expect(extractStreamedBlocks(full)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**, then implement `lib/ai/stream-draft.ts`:

```ts
// Best-effort extraction of complete block objects from a PARTIAL structured-
// output JSON stream, for live preview only. The authoritative parse remains
// parseDraftResponse on the final message — nothing extracted here is applied.
import type { ProposalBlock } from '@/lib/types'

export function extractStreamedBlocks(partialJson: string): ProposalBlock[] {
  const start = partialJson.indexOf('"blocks"')
  if (start === -1) return []
  const arrayStart = partialJson.indexOf('[', start)
  if (arrayStart === -1) return []
  const out: ProposalBlock[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  for (let i = arrayStart + 1; i < partialJson.length; i++) {
    const ch = partialJson[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; continue }
    if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try { out.push(JSON.parse(partialJson.slice(objStart, i + 1)) as ProposalBlock) } catch { /* skip malformed */ }
        objStart = -1
      }
      continue
    }
    if (ch === ']' && depth === 0) break // end of blocks array
  }
  return out
}
```

- [ ] **Step 3: Run to verify pass.**

- [ ] **Step 4: Extract the service.** Create `lib/ai/draft-service.ts` starting with `import 'server-only'`. Move the body of `generateProposalDraft` (from `actions/proposal-ai.ts`) into two functions: `prepareDraftRequest` (auth via `assertOrgAdmin`, notes validation, proposal fetch, `Promise.all` of catalog + voice + org from Task 3, and return the exact object currently passed to `client.beta.messages.stream(...)` as `requestParams`) and `finalizeDraft` (usage logging → `parseDraftResponse` → `mintSuggestedPackages` with the same `ai-${randomBytes(4).toString('hex')}` minting — copy the existing comments along). `prepareDraftRequest` takes `modelOverride?: string` which replaces `AI_MODEL` when set (used by the Task 10 bake-off; fallbacks spread stays conditional on `AI_FALLBACKS`). Then reduce `actions/proposal-ai.ts` to:

```ts
'use server'
import { getAnthropicClient } from '@/lib/ai/client'
import { prepareDraftRequest, finalizeDraft } from '@/lib/ai/draft-service'
import type { ProposalDraft } from '@/lib/ai/proposal-draft'

export async function generateProposalDraft(orgId: string, proposalId: string, notes: string): Promise<ProposalDraft> {
  const { requestParams } = await prepareDraftRequest(orgId, proposalId, notes)
  const stream = getAnthropicClient().beta.messages.stream(requestParams)
  const message = await stream.finalMessage()
  return finalizeDraft(orgId, message)
}
```

- [ ] **Step 5: Route handler.** Create `app/api/ai/proposal-draft/route.ts` (check the Next docs in `node_modules/next/dist/docs/` for the current route-handler signature before writing):

```ts
import { getAnthropicClient } from '@/lib/ai/client'
import { prepareDraftRequest, finalizeDraft } from '@/lib/ai/draft-service'

export async function POST(req: Request): Promise<Response> {
  const { orgId, proposalId, notes } = (await req.json()) as { orgId?: string; proposalId?: string; notes?: string }
  if (!orgId || !proposalId || typeof notes !== 'string') {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
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
```

Auth note: `prepareDraftRequest` calls `assertOrgAdmin(orgId)` internally (it moved over with the body), so the route is protected exactly like the action.

- [ ] **Step 6: Full test run** — `__tests__/actions/proposal-ai.test.ts` will need its mocks repointed (it now exercises the thin wrapper; either mock `lib/ai/draft-service` or keep the existing adminDb/SDK mocks working through the moved code — prefer the latter so the orchestration stays covered). PASS.

- [ ] **Step 7: Commit.** `git commit -am "feat(ai): shared draft service + streaming NDJSON route"`

---

### Task 5: Draft composer UI — hero card, modal, streaming preview

**Files:**
- Create: `components/admin/proposal-builder/DraftComposer.tsx`, `components/admin/proposal-builder/useDraftStream.ts`
- Modify: `components/admin/proposal-builder/BlockCanvas.tsx` (placeholder affordance + hero slot), delete-later note: `ProposalAiPanel.tsx` is superseded and will be deleted in this task along with its test.
- Test: `__tests__/components/admin/proposal-builder/DraftComposer.test.tsx`, `__tests__/components/admin/proposal-builder/useDraftStream.test.ts`

**Interfaces:**
- Consumes: route protocol from Task 4; `extractStreamedBlocks`; existing `onAiApply(blocks, mode)` in `ProposalBuilderClient`.
- Produces:

```ts
// useDraftStream.ts
export type DraftStreamState =
  | { status: 'idle' }
  | { status: 'streaming'; previewBlocks: ProposalBlock[] }
  | { status: 'done'; draft: ProposalDraft }
  | { status: 'error'; message: string }
export function useDraftStream(): {
  state: DraftStreamState
  generate: (args: { orgId: string; proposalId: string; notes: string }) => Promise<void>
  reset: () => void
}

// DraftComposer.tsx
export function DraftComposer(props: {
  orgId: string; proposalId: string
  placeholderCount: number; hasBlocks: boolean
  open: boolean; onOpenChange: (open: boolean) => void
  onApply: (blocks: ProposalBlock[], mode: 'fill' | 'replace') => void
  variant: 'modal' | 'hero'   // hero renders inline (no Dialog shell), modal wraps in Dialog
})
```

- [ ] **Step 1: Failing hook test.** `useDraftStream.test.ts`: mock `global.fetch` to return a `Response` whose body is a `ReadableStream` emitting two NDJSON lines (`{"type":"delta","text":"{\"blocks\":[{\"id\":\"a\",\"type\":\"heading\",\"text\":\"Hi\",\"level\":2}"}` then `{"type":"final","draft":{...minimal ProposalDraft...}}`), render the hook with `renderHook`, call `generate`, assert state transitions `streaming` (with `previewBlocks[0].text === 'Hi'`) → `done`. Second test: a `{"type":"error"}` line yields `{ status: 'error' }`. Write the actual mock stream with `new ReadableStream({ start(c) { c.enqueue(encode(line1)); c.enqueue(encode(line2)); c.close() } })`.

- [ ] **Step 2: Implement `useDraftStream.ts`.** Accumulate delta text into a ref string; on each delta set state `{ status: 'streaming', previewBlocks: extractStreamedBlocks(accumulated) }`; parse NDJSON by splitting the accumulated *network* buffer on `\n` (keep the trailing partial line in the buffer). `final` → `{ status: 'done', draft }`; `error` event or fetch failure → `{ status: 'error', message }`. Run tests → PASS.

- [ ] **Step 3: Failing component test.** `DraftComposer.test.tsx` (mock `useDraftStream`): renders textarea with placeholder "Paste call notes, an email thread, or a transcript…", a **Generate draft** button disabled when notes empty; in `done` state shows preview blocks and buttons "Fill N placeholder sections" (or "Use draft" when `!hasBlocks`) and confirm-gated "Replace document" (mock `window.confirm`); clicking fill calls `onApply(draft.blocks, 'fill')`. Port these behaviors (and the SuggestedPackages summary + adjustments rendering) from `ProposalAiPanel.tsx` — same strings, same confirm text.

- [ ] **Step 4: Implement `DraftComposer.tsx`.** Reuse the body of `ProposalAiPanel` (notes textarea, generate, preview, fill/replace, `SuggestedPackages`, adjustments) but: generation goes through `useDraftStream`; while `streaming`, render `previewBlocks` live (headings bold, paragraphs, lists joined with " • ", testimonials italic — same rendering as the old panel's preview) with a subtle "Writing…" indicator; `variant: 'modal'` wraps content in the existing `Dialog` from `components/ui/dialog` titled **"Draft this proposal from your notes"**; `variant: 'hero'` renders the same content inline in a bordered card with the heading **"Draft this proposal from your notes"** and subtitle "Paste call notes, an email thread, or a transcript — you'll get a full draft with suggested packages." Run tests → PASS.

- [ ] **Step 5: Seat it in the canvas.** In `BlockCanvas.tsx`: (a) add optional props `onFillWithAi?: () => void` and `hero?: ReactNode`; render `hero` above the blocks when provided; (b) on each placeholder block's existing chrome add a small ghost button **"Fill with AI"** calling `onFillWithAi` (only when the prop is present and not disabled); (c) give every placeholder block's wrapper `data-placeholder-block` so the Task 7 chip can scroll to it. Update `BlockCanvas.test.tsx` with a test that the button fires the callback and that non-placeholder blocks don't get it.

- [ ] **Step 6: Delete `ProposalAiPanel.tsx` and `__tests__/.../ProposalAiPanel.test.tsx`.** (`ProposalBuilderClient` still imports it — that wiring is replaced in Task 9; to keep the tree compiling this task, leave `RightRail`'s import working by removing the panel usage from `RightRail.tsx`: delete its `ProposalAiPanel` import and the `aiEnabled` block at the bottom. The rail itself dies in Task 9.)

- [ ] **Step 7: Full test run** (`npx vitest run --exclude '**/.claude/**'`) — PASS.

- [ ] **Step 8: Commit.** `git commit -am "feat(builder): streaming draft composer, in-canvas hero, placeholder fill affordance"`

---

### Task 6: Editable Totals section on the canvas

**Files:**
- Create: `components/admin/proposal-builder/TotalsCanvas.tsx`
- Test: `__tests__/components/admin/proposal-builder/TotalsCanvas.test.tsx`

**Interfaces:**
- Consumes: `ProposalDraftUpdate`, `update` patcher, `proposalRange`/`depositAmount` from `lib/proposals`, popover idiom from `PricingCanvas`.
- Produces:

```ts
export function TotalsCanvas(props: {
  draft: ProposalDraftUpdate
  update: (patch: Partial<ProposalDraftUpdate>) => void
  range: { min: number; max: number }   // computed in ProposalBuilderClient, already exists there
  disabled: boolean
})
```

Rendered rows (mirroring the client-facing `ProposalTotals` layout): Total (from `range`), then builder-editable rows for Discount, Tax, Deposit due, Expiry, and a Notes block. Ghost "+ Add …" rows appear only when unset and `!disabled`.

- [ ] **Step 1: Failing tests** in `TotalsCanvas.test.tsx` (the patch-shape assertions below are the load-bearing part — they encode today's `RightRail` semantics exactly):

```tsx
// setup helper
const update = vi.fn()
const draft: ProposalDraftUpdate = { tax_rate: 8.5, discount: { type: 'percent', value: 10 }, deposit: { type: 'percent', value: 50 }, deposit_gate: 'after_accept' }
render(<TotalsCanvas draft={draft} update={update} range={{ min: 100, max: 100 }} disabled={false} />)
```

Tests:
1. Renders "Total" with `$100.00`; renders "Discount", "Tax", "Deposit due" rows with current values; renders "+ Add expiry" ghost (no `expires_at` set).
2. Clicking the Discount row opens a popover; changing type to "None" calls `update({ discount: undefined })`; changing value to 15 calls `update({ discount: { type: 'percent', value: 15 } })`.
3. Clicking Deposit row → popover shows radio pair "Request deposit after acceptance" / "Require deposit before accepting" and a "Cancellation / refund policy" textarea; switching to "None" type calls `update({ deposit: undefined, deposit_gate: undefined, deposit_terms: undefined })` (the existing clear-on-remove invariant from RightRail.tsx:189).
4. Expiry ghost click reveals a date input; setting a date calls `update({ expires_at: '2026-09-01' })`; clearing calls `update({ expires_at: undefined })`.
5. "Notes for the client" textarea patches `update({ notes: 'x' })` and `update({ notes: undefined })` on empty.
6. `disabled` renders every row as plain text — no buttons, no ghosts (query `screen.queryByRole('button')` → null).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `TotalsCanvas.tsx`.** One `popover` state union like PricingCanvas (`type Popover = 'discount' | 'tax' | 'deposit' | null`), absolute-positioned popover cards (`className="absolute z-30 mt-1 w-64 space-y-2 rounded-md border bg-white p-3 shadow-lg"`), rows as `<button>` when enabled / `<span>` when disabled. Reuse `toNumber` (copy the 4-line helper — it lives privately in two files already; keep it private here too). Discount/deposit popovers: select None/Percent/Fixed + number input (exact patch shapes from the tests). Deposit popover additionally has the gate radios (patching `deposit_gate`) and terms textarea (patching `deposit_terms`, `undefined` on empty), only when a deposit is set. Expiry: `<Input type="date">` inline. Money formatting via the local `money` helper pattern (`$${n.toFixed(2)}` with a range join for min≠max).

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(builder): editable totals section on the canvas"`

---

### Task 7: Command bar (TopBar rework)

**Files:**
- Modify: `components/admin/proposal-builder/TopBar.tsx` (grows into the command bar; keep the filename)
- Test: `__tests__/components/admin/proposal-builder/TopBar.test.tsx` (create — none exists today)

**Interfaces:**
- Consumes: `SaveStatus` from `useDraftAutosave`, `PROPOSAL_STATUS_LABELS`.
- Produces (new props consumed by Task 9):

```ts
export function TopBar(props: {
  orgSlug: string; leadId: string
  title: string; onTitle: (next: string) => void
  status: ProposalStatus; token: string; locked: boolean
  viewport: Viewport; onViewport: (v: Viewport) => void
  // NEW:
  saveStatus: SaveStatus; retryNow: () => void
  placeholderCount: number
  onPlaceholderChip: () => void        // scrolls to first [data-placeholder-block]
  aiEnabled: boolean; onOpenAi: () => void
  onSend: () => void                   // opens the Review & Send dialog
  onCopyLink: () => void               // sent state primary
  onVoid: () => void; onDelete: () => void
  busy: boolean
})
```

- [ ] **Step 1: Failing tests** in `TopBar.test.tsx`:
1. Draft state (`status: 'draft'`, `locked: false`): primary button **"Send to client…"** calls `onSend`; a **"✦ Draft with AI"** button calls `onOpenAi` (absent when `aiEnabled: false`); no "Copy client link".
2. Sent state (`status: 'sent'`): primary is **"Copy client link"** → `onCopyLink`; overflow menu (button `aria-label="More actions"`) opens and contains "Open print view", "Desktop", "Mobile", "Void proposal"; no Delete.
3. Draft overflow contains "Delete" (→ `onDelete`) and NOT "Void proposal".
4. `saveStatus: 'retrying'` renders "Retry now" → `retryNow`; `saveStatus: 'saved'` renders "Saved".
5. `placeholderCount: 2` renders a chip "2 placeholders" → `onPlaceholderChip`; `placeholderCount: 0` renders no chip.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Keep back link, `InlineText` title, status `Badge`. Add: save-status text span (reuse the `SAVE_LABELS` map — move it from RightRail into TopBar); amber chip button (`className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"`); AI button (`variant="outline"`, text `✦ Draft with AI`); primary `Button` switching on `status === 'draft' && !locked` → Send, `status === 'sent' || status === 'accepted'` → Copy link; overflow as a hand-rolled popover (button `⋯` `aria-label="More actions"`, absolute card with `role="menu"`, items as ghost buttons: Open print view → `window.open(`/proposals/${token}/print`, '_blank')`, Desktop/Mobile calling `onViewport`, then Void (sent, not voided, not locked-by-signature) or Delete (draft), destructive-styled). Close the menu on item click and on outside click (same `useEffect` mousedown-outside pattern as ItemPopover if it has one; otherwise a simple document listener).

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(builder): command bar — save state, placeholder chip, AI button, primary send, overflow"`

---

### Task 8: Review & Send dialog

**Files:**
- Create: `components/admin/proposal-builder/SendDialog.tsx` (spec says a right-side Sheet; the repo has no Sheet primitive and we add no dependencies, so this is a centered `Dialog` — same content and flow)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx` (fetch lead, pass contact through)
- Test: `__tests__/components/admin/proposal-builder/SendDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog` primitives, `proposalRange` output (passed in), `depositAmount` from `lib/proposals`.
- Produces:

```ts
export interface SendRecipient { name: string; email?: string }
export function SendDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void
  recipient: SendRecipient | null
  placeholderCount: number
  rangeLabel: string                    // preformatted "$X" or "$X–$Y"
  deposit?: ProposalDeposit; depositGate?: 'before_accept' | 'after_accept'
  expiresAt?: string
  shareLink: string
  busy: boolean
  sent: boolean                         // flips the dialog to the success state
  onConfirmSend: () => void
  onJumpToPlaceholders: () => void
})
```

`ProposalBuilderClient` (Task 9) owns `sent` (set after `sendProposal` resolves) — the dialog is presentational.

- [ ] **Step 1: Failing tests:**
1. Pre-send: title "Review & send"; shows recipient name/email; shows "Client sees: $500.00"; deposit line "Deposit due: $250.00 — requested after acceptance" when `deposit={type:'percent',value:50}` and range max 500; warning row "2 placeholder sections will be hidden from the client" with a "Jump to first" button → `onJumpToPlaceholders`; warning "No expiry date set" when `expiresAt` undefined; **Send** button → `onConfirmSend`, disabled when `busy`.
2. Zero placeholders + expiry set: no warning rows.
3. `sent: true`: shows "Sent!", the share link in a readonly input, and a **Copy link** button that writes `shareLink` to a mocked `navigator.clipboard.writeText`.
4. `recipient: null`: recipient row absent (no crash).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** with the existing `Dialog`/`DialogContent`/`DialogHeader` primitives. Warnings as amber rows (`text-amber-700`), summary as a small definition list. Deposit line via `depositAmount(rangeMax, deposit)` — pass `rangeMax: number` as an extra prop if cleaner (then update the interface block above and Task 9's call site to match — keep the two in sync). Success state replaces the body when `sent`.

- [ ] **Step 4: Lead contact plumbing.** In the builder page (`.../proposals/[proposalId]/page.tsx`), also `getLead(orgId, leadId)` (import from `@/actions/leads`) and pass `leadContact={lead ? { name: lead.name, email: lead.email } : null}` to `ProposalBuilderClient` (add the prop there in Task 9; for this task, add the prop to the client component's signature as optional so the tree compiles).

- [ ] **Step 5: Run tests → PASS. Commit.** `git commit -am "feat(builder): review & send dialog with pre-flight and post-send link"`

---

### Task 9: Wire it all — delete the rail, rewrite ProposalBuilderClient

**Files:**
- Delete: `components/admin/proposal-builder/RightRail.tsx`
- Modify: `components/admin/proposal-builder/ProposalBuilderClient.tsx`
- Test: rewrite `__tests__/components/admin/proposal-builder/ProposalBuilderClient.test.tsx`

**Interfaces:**
- Consumes: everything produced in Tasks 5–8.
- Produces: final page composition. New prop `leadContact?: { name: string; email?: string } | null`.

- [ ] **Step 1: Rewrite the client.** In `ProposalBuilderClient.tsx`:
  - Remove `RightRail` import/usage; layout becomes command bar over a single full-width `<main>`.
  - State additions: `sendOpen`, `sentFlag` (post-send success), `aiOpen`, and a `flash: string | null` transient error (rendered as a fixed top-right dismissable card — `role="status"`, auto-clear via `setTimeout` 6s — this replaces rail error text; no toast library).
  - `handleSend` loses its `window.confirm` (pre-flight moved into the dialog): called from `SendDialog.onConfirmSend`, on success `setDocStatus('sent'); setSentFlag(true)`; on error set `flash`.
  - `handleVoid` keeps `window.prompt` for the reason (spec: small dialog is acceptable as prompt for now — the prompt IS the existing behavior; keep it). `handleDelete` keeps its confirm.
  - Share link building moves here from the rail: `const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/proposals/${proposal.token}` : `/proposals/${proposal.token}``; `copyLink` writes it to the clipboard and sets `flash` to "Link copied".
  - `scrollToPlaceholder = () => document.querySelector('[data-placeholder-block]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - Compose: `<TopBar …new props…/>`; inside the themed document: `hero` prop of `BlockCanvas` set to `<DraftComposer variant="hero" …/>` when `aiEnabled && !locked && blocks.every(b => b.placeholder === true)` (covers empty: `blocks.length === 0` also qualifies — condition: `blocks.filter(b => !b.placeholder).length === 0`); `onFillWithAi={() => setAiOpen(true)}`; after `PricingCanvas`, render `<TotalsCanvas draft={draft} update={update} range={range} disabled={locked} />`; the old rail-only fields (notes/expiry/discount/tax/deposit) now live there. Mount `<DraftComposer variant="modal" open={aiOpen} …/>` and `<SendDialog …/>` at the root.
  - Autosave `adjustments` render into the flash area too (amber).
- [ ] **Step 2: Delete `RightRail.tsx`.** Grep for remaining imports: `grep -rn "RightRail" components app --include="*.tsx"` → must be empty (ignore `.claude/worktrees`).
- [ ] **Step 3: Rewrite `ProposalBuilderClient.test.tsx`.** Mock the child components lightly (vi.mock TopBar/SendDialog/DraftComposer/TotalsCanvas to prop-capturing stubs where the existing test file mocks the rail) and assert the wiring: draft renders hero condition correctly (all-placeholder blocks → hero present; any real block → absent); `onSend` from TopBar opens SendDialog; SendDialog confirm calls the mocked `sendProposal` and flips to `sent`; TotalsCanvas receives `disabled: true` when proposal has a signature; voided proposal renders the voided banner (existing assertion — keep).
- [ ] **Step 4: Full test run** `npx vitest run --exclude '**/.claude/**'` → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(builder): command-bar layout, rail removed, send + AI wired"`

---

### Task 10: Model bake-off script

**Files:**
- Create: `scripts/proposal-draft-bakeoff.md`

**Interfaces:** none (operator-run documentation; `prepareDraftRequest(orgId, proposalId, notes, modelOverride)` from Task 4 already supports the override).

- [ ] **Step 1: Write `scripts/proposal-draft-bakeoff.md`** — a short runbook: pick 3 real sets of call notes; for each, generate once with the deployed default (`claude-opus-5` / effort medium) and once by temporarily setting `AI_MODEL = 'claude-sonnet-5'` + `AI_EFFORT = 'high'` + `AI_FALLBACKS = null` + `AI_BETAS = []` in `lib/ai/client.ts` on a scratch branch (never commit); save each result's blocks as A/B markdown files with the model names stripped; judge blind on voice-match, structure, and package sensibility; record the verdict at the bottom of the runbook and, if Sonnet wins, flip the constants in a follow-up commit. Include the exact constants to flip and the reminder that the streaming UI is model-agnostic.
- [ ] **Step 2: Commit.** `git commit -am "docs: proposal draft model bake-off runbook"`

---

### Task 11: Verification gate

- [ ] **Step 1:** `npx vitest run --exclude '**/.claude/**'` → all green.
- [ ] **Step 2:** `npx next build` → succeeds (required by repo rule before calling any branch green; catches `'use server'` type re-exports and route-handler typing).
- [ ] **Step 3:** Manual smoke via dev server (launch.json / preview): open a draft proposal → hero shows on an all-placeholder doc; generate streams visibly; totals rows edit and autosave ("Saved" returns); Send opens pre-flight, sends, reveals link; sent proposal shows Copy link primary + Void in overflow; locked proposal is fully read-only.
- [ ] **Step 4:** Final commit of any fixes; do not push (pushing requires `gh auth switch` to the Lifewithmo account — coordinate with the operator).
