# Operator AI Increment 1 — Proposal Drafting + `lib/ai/` Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `generateProposalDraft` — notes → grounded proposal blocks — and extract the shared `lib/ai/` core (client, grounding, usage logging) it rides on.

**Architecture:** A read-only server action (`assertOrgAdmin`) reads the proposal and the org's ops catalog, calls Claude once via a streaming request with a structured-output JSON schema, re-validates everything the model returns through `normalizeBlocks`, filters suggested package ids against the real catalog, logs token usage to Firestore, and returns the draft to the editor as unsaved preview state. Nothing the model produces is persisted by this feature.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@anthropic-ai/sdk` (new dependency), Firebase Admin SDK, vitest + RTL. No zod — hand-written guards, per repo convention.

**Specs:** [`2026-08-07-operator-ai-design.md`](../specs/2026-08-07-operator-ai-design.md) (this increment) and [`2026-08-06-proposal-presentation-design.md`](../specs/2026-08-06-proposal-presentation-design.md) § Increment 2 (the fixed model/grounding/error decisions).

## Global Constraints

- Work in a fresh worktree on branch `claude/operator-ai-drafting` off `main`. Fresh worktrees need `npm install` and a copied `.env.local` before anything runs.
- Run ALL test commands inside the worktree, never the primary checkout, always with `--exclude '**/.claude/**' --exclude '**/.worktrees/**'`.
- Model config (fixed by spec): model `claude-opus-5`; `thinking` omitted (adaptive is the default on this model); `max_tokens: 16000` (caps thinking + output together); effort `high` via `output_config.effort`; transport `client.beta.messages.stream(...)` → `.finalMessage()`; `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Structured output: raw JSON Schema in `output_config.format` — `additionalProperties: false`, `required` on every object, `anyOf` for the block union. The schema CANNOT express length caps; `normalizeBlocks` is the only enforcement point and must run on every model response.
- The model returns `suggested_package_ids`, never prices. Any id not in the org catalog is dropped server-side and reported.
- `ANTHROPIC_API_KEY` is server-only. Never `NEXT_PUBLIC_*`, never read from a client component. The server page computes `aiEnabled` and passes it as a prop.
- No live API calls anywhere in the test suite — the Anthropic client is mocked in every test.
- Check `stop_reason` BEFORE reading content: `refusal` → clear message, no auto-retry; `max_tokens` → "Draft too long — shorten your notes."
- `git commit` after every task, message style `feat(ai): ...` with the repo's `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.
- Green gate before the final commit: `npx tsc --noEmit` && `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**'` && `npm run build`. `npm run build` is non-negotiable — a `'use server'` type re-export passes tsc and breaks the build; it has bitten this repo twice.

## File Structure

| File | Responsibility |
|---|---|
| `lib/ai/client.ts` (create) | The single Anthropic client: lazy singleton, model/token/effort/beta constants, `isAiEnabled()` |
| `lib/ai/grounding.ts` (create) | Pure prompt builders: catalog serialization, system blocks with `cache_control` |
| `lib/ai/usage.ts` (create) | Best-effort usage logging to `orgs/{orgId}/ai_usage` |
| `lib/ai/proposal-draft.ts` (create) | Pure: the response JSON schema + `parseDraftResponse` (stop_reason → parse → normalize → filter) |
| `actions/proposal-ai.ts` (create) | The guarded server action `generateProposalDraft` |
| `components/admin/ProposalAiPanel.tsx` (create) | Notes textarea → Generate → preview → Use draft / Append / Replace |
| `components/admin/ProposalBlockEditor.tsx` (modify) | Accept `aiEnabled` prop, render the panel, apply drafts into `blocks` state |
| `components/admin/ProposalEditorClient.tsx` (modify) | Thread `aiEnabled` through to the block editor |
| `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx` (modify) | Compute `aiEnabled = !!process.env.ANTHROPIC_API_KEY` |
| `.env.example` (modify) | Document `ANTHROPIC_API_KEY` |

---

### Task 0: Worktree + dependency setup

**Files:**
- Modify: `package.json` (via `npm install @anthropic-ai/sdk`)
- Modify: `.env.example`

**Interfaces:**
- Produces: a working worktree with `@anthropic-ai/sdk` installed; every later task runs here.

- [ ] **Step 1: Create the worktree and install**

```bash
git -C /Users/rm/vw/traxevent worktree add .worktrees/operator-ai -b claude/operator-ai-drafting main
cd /Users/rm/vw/traxevent/.worktrees/operator-ai
npm install
cp /Users/rm/vw/traxevent/.env.local .env.local
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify the baseline is green**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' 2>&1 | tail -5`
Expected: all tests pass (1058 at time of writing).

- [ ] **Step 3: Add the env var to `.env.example`**

Append after the Resend section:

```bash
# Anthropic (operator AI features — proposal drafting). Server-only; never NEXT_PUBLIC.
# When unset, AI buttons do not render and AI actions throw a clear error.
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat(ai): add @anthropic-ai/sdk dependency and ANTHROPIC_API_KEY plumbing"
```

---

### Task 1: `lib/ai/client.ts` — the single client

**Files:**
- Create: `lib/ai/client.ts`
- Test: `__tests__/lib/ai/client.test.ts`

**Interfaces:**
- Produces:
  - `isAiEnabled(): boolean` — true iff `process.env.ANTHROPIC_API_KEY` is set and non-empty
  - `getAnthropicClient(): Anthropic` — lazy singleton; throws `Error('AI is not configured')` when the key is unset
  - `AI_MODEL = 'claude-opus-5'`, `AI_MAX_TOKENS = 16000`, `AI_EFFORT = 'high' as const`, `AI_BETAS = ['server-side-fallback-2026-07-01']`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/ai/client.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/client.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/client`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/ai/client.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/client.test.ts`
Expected: PASS (5 tests). Note: `server-only` is aliased to an empty shim in `vitest.config.ts`, so importing this module in tests is fine.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/client.ts __tests__/lib/ai/client.test.ts
git commit -m "feat(ai): lib/ai/client — lazy Anthropic client and spec-fixed model config"
```

---

### Task 2: `lib/ai/grounding.ts` — pure prompt builders

**Files:**
- Create: `lib/ai/grounding.ts`
- Test: `__tests__/lib/ai/grounding.test.ts`

**Interfaces:**
- Consumes: `WorkPackage`, `OpsResource` from `@/lib/types`
- Produces:
  - `serializeCatalog(packages: WorkPackage[], resources: OpsResource[]): string` — deterministic text (sorted by id) describing each package (id, name, description, price, max_guests, scope) and resource (id, name, kind, unit). Prices appear ONLY here, as ground truth the model may reference but never restate into output (the schema has no price fields).
  - `buildDraftSystemBlocks(catalogText: string): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>` — block 0: the drafting system prompt (static string); block 1: the catalog with `cache_control: { type: 'ephemeral' }` on it. Volatile input (notes) is NOT built here — it goes in the user message, after the cached prefix.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/ai/grounding.test.ts
import { describe, it, expect } from 'vitest'
import { serializeCatalog, buildDraftSystemBlocks } from '@/lib/ai/grounding'
import type { WorkPackage, OpsResource } from '@/lib/types'

const pkgs: WorkPackage[] = [
  { id: 'wp-b', name: 'Big Bar', price: 2500, lines: [], max_guests: 150, created_at: 'x' },
  { id: 'wp-a', name: 'Coffee Cart', description: 'Espresso service', price: 1200, lines: [], created_at: 'x' },
]
const res: OpsResource[] = [
  { id: 'r-2', name: 'Oat milk', kind: 'consumable', unit: 'gal', created_at: 'x' },
  { id: 'r-1', name: 'Espresso machine', kind: 'reusable', created_at: 'x' },
]

describe('serializeCatalog', () => {
  it('includes every package id, name, and price', () => {
    const text = serializeCatalog(pkgs, res)
    expect(text).toContain('wp-a')
    expect(text).toContain('Coffee Cart')
    expect(text).toContain('1200')
    expect(text).toContain('wp-b')
    expect(text).toContain('2500')
  })

  it('includes every resource id, name, kind, and unit when present', () => {
    const text = serializeCatalog(pkgs, res)
    expect(text).toContain('r-1')
    expect(text).toContain('Espresso machine')
    expect(text).toContain('r-2')
    expect(text).toContain('gal')
  })

  it('is deterministic: input order does not change the output', () => {
    const a = serializeCatalog(pkgs, res)
    const b = serializeCatalog([...pkgs].reverse(), [...res].reverse())
    expect(a).toBe(b)
  })

  it('states an empty catalog explicitly rather than emitting nothing', () => {
    const text = serializeCatalog([], [])
    expect(text.length).toBeGreaterThan(0)
    expect(text).toMatch(/no packages/i)
  })
})

describe('buildDraftSystemBlocks', () => {
  it('returns [static prompt, catalog] with cache_control on the catalog block', () => {
    const blocks = buildDraftSystemBlocks('CATALOG-TEXT')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].cache_control).toBeUndefined()
    expect(blocks[1].text).toContain('CATALOG-TEXT')
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('the system prompt forbids inventing prices and instructs ids-only suggestions', () => {
    const [prompt] = buildDraftSystemBlocks('x')
    expect(prompt.text).toMatch(/never.*(invent|make up).*(price|pricing)/i)
    expect(prompt.text).toMatch(/suggested_package_ids/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/grounding.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/grounding`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/ai/grounding.ts
// Pure prompt builders — NO backend/DB imports, mirroring lib/ops/derive.ts.
// Callers fetch the data (listWorkPackagesCore/listResourcesCore); these
// functions only turn it into deterministic, cache-stable prompt text.
import type { WorkPackage, OpsResource } from '@/lib/types'

// Deterministic (sorted by id) so the rendered prompt bytes are identical
// across requests for the same catalog — prompt caching is a prefix match,
// and any byte change invalidates everything after it.
export function serializeCatalog(packages: WorkPackage[], resources: OpsResource[]): string {
  const pkgLines = [...packages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const parts = [
        `- id: ${p.id} | name: ${p.name} | price: $${p.price}`,
        p.max_guests !== undefined ? `max_guests: ${p.max_guests}` : null,
        p.description ? `description: ${p.description}` : null,
        p.scope ? `scope: ${p.scope}` : null,
      ].filter(Boolean)
      return parts.join(' | ')
    })
  const resLines = [...resources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) =>
      [`- id: ${r.id} | name: ${r.name} | kind: ${r.kind}`, r.unit ? `unit: ${r.unit}` : null]
        .filter(Boolean)
        .join(' | '),
    )
  return [
    '## Work packages',
    pkgLines.length ? pkgLines.join('\n') : '(no packages defined)',
    '',
    '## Resources',
    resLines.length ? resLines.join('\n') : '(no resources defined)',
  ].join('\n')
}

const DRAFT_SYSTEM_PROMPT = `You draft proposal documents for a booked-job business (events, mobile beverage service, and similar). You write on behalf of the business owner, addressed to their customer.

You are given the org's real catalog of work packages and resources, plus the operator's raw notes about this opportunity. Produce a customer-facing proposal document as structured blocks.

Rules you may not break:
- NEVER invent prices, discounts, legal terms, or scope not present in the notes or catalog. Prices live in the catalog and the proposal's pricing section — not in your document text.
- When notes align with catalog packages, list their ids in suggested_package_ids. Suggest only ids that appear in the catalog. Never write package prices into blocks.
- Write in clear, warm, professional prose. No placeholder text, no "[insert X]".
- rationale is one paragraph addressed to the OPERATOR (not the customer) explaining your drafting choices.`

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export function buildDraftSystemBlocks(catalogText: string): SystemBlock[] {
  return [
    { type: 'text', text: DRAFT_SYSTEM_PROMPT },
    // cache_control on the LAST stable block: system prompt + catalog cache
    // together; the per-request notes go in the user message after this.
    { type: 'text', text: `# Org catalog (ground truth)\n\n${catalogText}`, cache_control: { type: 'ephemeral' } },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/grounding.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/grounding.ts __tests__/lib/ai/grounding.test.ts
git commit -m "feat(ai): lib/ai/grounding — deterministic catalog serialization and cached system blocks"
```

---

### Task 3: `lib/ai/usage.ts` — usage logging

**Files:**
- Create: `lib/ai/usage.ts`
- Test: `__tests__/lib/ai/usage.test.ts`

**Interfaces:**
- Consumes: `adminDb` from `@/lib/firebase-admin`
- Produces: `logAiUsage(orgId: string, feature: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }): Promise<void>` — writes one doc to `orgs/{orgId}/ai_usage` with a random id, `{ feature, input_tokens, output_tokens, cache_read_input_tokens, created_at }`. **Never throws** — a logging failure must not break a successful generation.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/ai/usage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
const doc = vi.fn(() => ({ set }))
const subCollection = vi.fn(() => ({ doc }))
const orgDoc = vi.fn(() => ({ collection: subCollection }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: orgDoc }) },
}))

import { logAiUsage } from '@/lib/ai/usage'

beforeEach(() => {
  vi.clearAllMocks()
  set.mockResolvedValue(undefined)
})

describe('logAiUsage', () => {
  it('writes feature tag and token counts under orgs/{orgId}/ai_usage', async () => {
    await logAiUsage('org-1', 'proposal_draft', {
      input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 900,
    })
    expect(orgDoc).toHaveBeenCalledWith('org-1')
    expect(subCollection).toHaveBeenCalledWith('ai_usage')
    const written = set.mock.calls[0][0]
    expect(written.feature).toBe('proposal_draft')
    expect(written.input_tokens).toBe(1200)
    expect(written.output_tokens).toBe(800)
    expect(written.cache_read_input_tokens).toBe(900)
    expect(typeof written.created_at).toBe('string')
  })

  it('defaults cache_read_input_tokens to 0 when absent', async () => {
    await logAiUsage('org-1', 'proposal_draft', { input_tokens: 10, output_tokens: 5 })
    expect(set.mock.calls[0][0].cache_read_input_tokens).toBe(0)
  })

  it('swallows write failures instead of throwing', async () => {
    set.mockRejectedValue(new Error('firestore down'))
    await expect(
      logAiUsage('org-1', 'proposal_draft', { input_tokens: 1, output_tokens: 1 }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/usage.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/usage`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/ai/usage.ts
import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'

export interface AiUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
}

// App-level logging is the only observability (no gateway), and this
// collection is the future billing/plan-gating hook. Best-effort by design:
// a failed usage write must never fail the generation the operator is
// waiting on.
export async function logAiUsage(orgId: string, feature: string, usage: AiUsage): Promise<void> {
  try {
    const id = randomBytes(8).toString('hex')
    await adminDb
      .collection('orgs').doc(orgId)
      .collection('ai_usage').doc(id)
      .set({
        feature,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        created_at: new Date().toISOString(),
      })
  } catch {
    // swallow — observability must not break the feature it observes
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/usage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/usage.ts __tests__/lib/ai/usage.test.ts
git commit -m "feat(ai): lib/ai/usage — best-effort per-call token logging to orgs/{orgId}/ai_usage"
```

---

### Task 4: `lib/ai/proposal-draft.ts` — schema + response parsing (pure)

**Files:**
- Create: `lib/ai/proposal-draft.ts`
- Test: `__tests__/lib/ai/proposal-draft.test.ts`

**Interfaces:**
- Consumes: `normalizeBlocks` from `@/lib/proposals/blocks`
- Produces:
  - `PROPOSAL_DRAFT_SCHEMA: object` — raw JSON Schema for `{ blocks, suggested_package_ids, rationale }`. The block union covers `heading | paragraph | list | testimonial` only. **No `image` blocks**: the model has no real URLs, and a hallucinated URL would either render broken or be dropped by `normalizeBlocks` anyway — excluding it from the schema prevents the failure instead of cleaning it up.
  - `parseDraftResponse(message: DraftMessage, validPackageIds: string[]): DraftResult` where
    - `DraftMessage = { stop_reason: string | null; content: Array<{ type: string; text?: string }> }` (the subset of the SDK message the parser reads — keeps the module SDK-type-free and trivially testable)
    - `DraftResult = { blocks: ProposalBlock[]; suggested_package_ids: string[]; rationale: string; adjustments: string[] }`
  - Throws `Error('The AI declined to draft from these notes. Try rephrasing them.')` on `stop_reason === 'refusal'` (fires only if the server-side fallback chain also refused).
  - Throws `Error('Draft too long — shorten your notes.')` on `stop_reason === 'max_tokens'` (truncated JSON is unparseable — fail before parsing).
  - Throws `Error('The AI returned an unreadable draft. Try again.')` on missing text block / JSON parse failure.
  - Unknown package ids are dropped and reported via `adjustments`, never thrown — one bad id must not discard a good draft.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/ai/proposal-draft.test.ts
import { describe, it, expect } from 'vitest'
import { PROPOSAL_DRAFT_SCHEMA, parseDraftResponse } from '@/lib/ai/proposal-draft'

function msg(payload: unknown, stop_reason = 'end_turn') {
  return { stop_reason, content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

const GOOD = {
  blocks: [
    { id: 'b1', type: 'heading', text: 'Your wedding bar service', level: 2 },
    { id: 'b2', type: 'paragraph', text: 'Thanks for reaching out about your July event.' },
  ],
  suggested_package_ids: ['wp-a'],
  rationale: 'Matched the coffee cart package from your notes.',
}

describe('PROPOSAL_DRAFT_SCHEMA', () => {
  it('is a strict object schema requiring blocks, suggested_package_ids, and rationale', () => {
    const s = PROPOSAL_DRAFT_SCHEMA as Record<string, unknown>
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['blocks', 'suggested_package_ids', 'rationale'])
  })

  it('does not permit image blocks (the model has no real URLs)', () => {
    expect(JSON.stringify(PROPOSAL_DRAFT_SCHEMA)).not.toContain('"image"')
  })
})

describe('parseDraftResponse — stop_reason gates', () => {
  it('throws the refusal message on stop_reason refusal, before reading content', () => {
    expect(() => parseDraftResponse({ stop_reason: 'refusal', content: [] }, []))
      .toThrow(/declined/i)
  })

  it('throws the too-long message on stop_reason max_tokens', () => {
    expect(() => parseDraftResponse({ stop_reason: 'max_tokens', content: [] }, []))
      .toThrow(/shorten your notes/i)
  })

  it('throws unreadable on a missing text block', () => {
    expect(() => parseDraftResponse({ stop_reason: 'end_turn', content: [] }, []))
      .toThrow(/unreadable/i)
  })

  it('throws unreadable on malformed JSON', () => {
    expect(() =>
      parseDraftResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{nope' }] }, []),
    ).toThrow(/unreadable/i)
  })
})

describe('parseDraftResponse — validation', () => {
  it('returns normalized blocks, valid ids, and rationale on a good response', () => {
    const r = parseDraftResponse(msg(GOOD), ['wp-a', 'wp-b'])
    expect(r.blocks).toHaveLength(2)
    expect(r.blocks[0]).toMatchObject({ type: 'heading', text: 'Your wedding bar service' })
    expect(r.suggested_package_ids).toEqual(['wp-a'])
    expect(r.rationale).toMatch(/coffee cart/i)
    expect(r.adjustments).toEqual([])
  })

  it('drops unknown package ids and reports them, keeping the draft', () => {
    const r = parseDraftResponse(
      msg({ ...GOOD, suggested_package_ids: ['wp-a', 'wp-fake'] }),
      ['wp-a'],
    )
    expect(r.suggested_package_ids).toEqual(['wp-a'])
    expect(r.adjustments.some((a) => a.includes('wp-fake'))).toBe(true)
    expect(r.blocks).toHaveLength(2)
  })

  it('runs blocks through normalizeBlocks — caps and drops apply to model output', () => {
    const r = parseDraftResponse(
      msg({ ...GOOD, blocks: [...GOOD.blocks, { id: 'b3', type: 'video', src: 'x' }] }),
      ['wp-a'],
    )
    expect(r.blocks).toHaveLength(2) // unsupported type dropped by normalizeBlocks
    expect(r.adjustments.some((a) => /unsupported/i.test(a))).toBe(true)
  })

  it('tolerates missing optional-shaped fields from a degraded response', () => {
    const r = parseDraftResponse(msg({ blocks: [], suggested_package_ids: [], rationale: '' }), [])
    expect(r.blocks).toEqual([])
    expect(r.suggested_package_ids).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/proposal-draft.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/proposal-draft`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/ai/proposal-draft.ts
// Pure request/response shapes for proposal drafting — no SDK, no DB imports.
// The action (actions/proposal-ai.ts) owns I/O; this module owns validation.
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { ProposalBlock } from '@/lib/types'

// Raw JSON Schema for output_config.format. Structured outputs cannot express
// minLength/maxLength/array-length caps, so this schema is NOT the enforcement
// point — normalizeBlocks re-validates every response (caps, drops, ids).
// The block union deliberately excludes `image`: the model has no real URLs.
const HEADING = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'text', 'level'],
  properties: {
    id: { type: 'string' }, type: { const: 'heading' },
    text: { type: 'string' }, level: { type: 'integer', enum: [2, 3] },
  },
}
const PARAGRAPH = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'text'],
  properties: { id: { type: 'string' }, type: { const: 'paragraph' }, text: { type: 'string' } },
}
const LIST = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'items'],
  properties: {
    id: { type: 'string' }, type: { const: 'list' },
    items: { type: 'array', items: { type: 'string' } },
    ordered: { type: 'boolean' },
  },
}
const TESTIMONIAL = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'quote'],
  properties: {
    id: { type: 'string' }, type: { const: 'testimonial' },
    quote: { type: 'string' }, attribution: { type: 'string' },
  },
}

export const PROPOSAL_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blocks', 'suggested_package_ids', 'rationale'],
  properties: {
    blocks: { type: 'array', items: { anyOf: [HEADING, PARAGRAPH, LIST, TESTIMONIAL] } },
    suggested_package_ids: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
} as const

export interface DraftMessage {
  stop_reason: string | null
  content: Array<{ type: string; text?: string }>
}

export interface DraftResult {
  blocks: ProposalBlock[]
  suggested_package_ids: string[]
  rationale: string
  adjustments: string[]
}

export function parseDraftResponse(message: DraftMessage, validPackageIds: string[]): DraftResult {
  // stop_reason is checked BEFORE content: a refusal has empty/partial
  // content, and max_tokens means truncated (unparseable) JSON.
  if (message.stop_reason === 'refusal') {
    throw new Error('The AI declined to draft from these notes. Try rephrasing them.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Draft too long — shorten your notes.')
  }

  const textBlock = message.content.find((b) => b.type === 'text' && typeof b.text === 'string')
  if (!textBlock?.text) throw new Error('The AI returned an unreadable draft. Try again.')

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(textBlock.text) as Record<string, unknown>
  } catch {
    throw new Error('The AI returned an unreadable draft. Try again.')
  }

  // Our own guards re-validate the parsed object — required, not defensive
  // duplication (the schema cannot express the caps normalizeBlocks enforces).
  const { blocks, adjustments } = normalizeBlocks(payload.blocks)

  const valid = new Set(validPackageIds)
  const rawIds = Array.isArray(payload.suggested_package_ids)
    ? payload.suggested_package_ids.filter((x): x is string => typeof x === 'string')
    : []
  const suggested = rawIds.filter((id) => valid.has(id))
  for (const id of rawIds) {
    if (!valid.has(id)) adjustments.push(`Dropped a suggested package not in your catalog: "${id}".`)
  }

  const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
  return { blocks, suggested_package_ids: suggested, rationale, adjustments }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/lib/ai/proposal-draft.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/proposal-draft.ts __tests__/lib/ai/proposal-draft.test.ts
git commit -m "feat(ai): proposal draft schema and response parsing with normalize-and-report validation"
```

---

### Task 5: `actions/proposal-ai.ts` — the guarded server action

**Files:**
- Create: `actions/proposal-ai.ts`
- Test: `__tests__/actions/proposal-ai.test.ts`

**Interfaces:**
- Consumes: `assertOrgAdmin` (`@/lib/auth/assert`), `adminDb`, `listWorkPackagesCore` (`@/lib/ops/work-packages`), `listResourcesCore` (`@/lib/ops/resources`), Task 1–4 modules
- Produces: `generateProposalDraft(orgId: string, proposalId: string, notes: string): Promise<DraftResult>` — read-only (writes nothing except the `ai_usage` log). Later increments extend this signature with `turns?: RefinementTurn[]`.

Request shape (fixed by spec + current SDK surface — `thinking` omitted deliberately, adaptive is the Opus 5 default):

```typescript
const stream = client.beta.messages.stream({
  model: AI_MODEL,
  max_tokens: AI_MAX_TOKENS,
  betas: AI_BETAS,
  fallbacks: 'default',
  output_config: { effort: AI_EFFORT, format: { type: 'json_schema', schema: PROPOSAL_DRAFT_SCHEMA } },
  system: buildDraftSystemBlocks(serializeCatalog(packages, resources)),
  messages: [{ role: 'user', content: userPrompt }],
})
const message = await stream.finalMessage()
```

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/actions/proposal-ai.test.ts
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

const finalMessage = vi.fn()
const streamFn = vi.fn(() => ({ finalMessage }))
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
  suggested_package_ids: ['wp-a', 'wp-ghost'],
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

  it('returns the parsed draft with catalog-filtered package ids', async () => {
    const r = await generateProposalDraft('o1', 'p1', 'notes')
    expect(r.blocks).toHaveLength(1)
    expect(r.suggested_package_ids).toEqual(['wp-a'])
    expect(r.adjustments.some((a) => a.includes('wp-ghost'))).toBe(true)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/actions/proposal-ai.test.ts`
Expected: FAIL — cannot resolve `@/actions/proposal-ai`.

- [ ] **Step 3: Write the implementation**

```typescript
// actions/proposal-ai.ts
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { listWorkPackagesCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { getAnthropicClient, AI_MODEL, AI_MAX_TOKENS, AI_EFFORT, AI_BETAS } from '@/lib/ai/client'
import { serializeCatalog, buildDraftSystemBlocks } from '@/lib/ai/grounding'
import { PROPOSAL_DRAFT_SCHEMA, parseDraftResponse, type DraftResult } from '@/lib/ai/proposal-draft'
import { logAiUsage } from '@/lib/ai/usage'
import type { Proposal } from '@/lib/types'

// Read-only by design: the draft lands in the editor as unsaved state and
// nothing persists until the admin saves through the normal block-editor
// path (which re-runs normalizeBlocks and the signed/voided guards). The
// only write here is the best-effort ai_usage log.
export async function generateProposalDraft(
  orgId: string,
  proposalId: string,
  notes: string,
): Promise<DraftResult> {
  await assertOrgAdmin(orgId)

  const trimmed = typeof notes === 'string' ? notes.trim() : ''
  if (!trimmed) throw new Error('Add some notes to draft from first.')

  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('proposals').doc(proposalId)
    .get()
  if (!snap.exists) throw new Error('Proposal not found')
  const proposal = snap.data() as Proposal

  const [packages, resources] = await Promise.all([
    listWorkPackagesCore(orgId),
    listResourcesCore(orgId),
  ])

  const client = getAnthropicClient()
  // Streaming transport for timeout safety on a long generation; the caller
  // still gets a single value via finalMessage() — no SSE plumbing in v1.
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    betas: AI_BETAS,
    fallbacks: 'default',
    output_config: {
      effort: AI_EFFORT,
      format: { type: 'json_schema', schema: PROPOSAL_DRAFT_SCHEMA },
    },
    system: buildDraftSystemBlocks(serializeCatalog(packages, resources)),
    messages: [{
      role: 'user',
      content: `Proposal context: title "${proposal.title ?? ''}", existing pricing notes "${proposal.notes ?? ''}".\n\nOperator notes to draft from:\n\n${trimmed}`,
    }],
  // The SDK's structured-output/fallbacks typings may lag; the wire shape is
  // authoritative. Keep this cast local to the one call.
  } as Parameters<typeof client.beta.messages.stream>[0])

  const message = await stream.finalMessage()

  // Log before parsing: a refusal or truncation still consumed tokens.
  await logAiUsage(orgId, 'proposal_draft', {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  })

  return parseDraftResponse(message, packages.map((p) => p.id))
}
```

Note for the implementer: if `tsc` rejects the request object even with the cast, fall back to `as never` on the single disputed property rather than loosening the whole call — and leave a one-line comment naming the SDK version. Typed SDK errors (`RateLimitError`, `APIError`) intentionally propagate — they are surfaced, not swallowed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/actions/proposal-ai.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Check nothing else broke, then commit**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' 2>&1 | tail -5`
Expected: full suite green.

```bash
git add actions/proposal-ai.ts __tests__/actions/proposal-ai.test.ts
git commit -m "feat(ai): generateProposalDraft server action — grounded, read-only, usage-logged"
```

---

### Task 6: UI — AI panel in the block editor

**Files:**
- Create: `components/admin/ProposalAiPanel.tsx`
- Modify: `components/admin/ProposalBlockEditor.tsx` (add `aiEnabled` prop, apply logic)
- Modify: `components/admin/ProposalEditorClient.tsx:430` (thread `aiEnabled` into `<ProposalBlockEditor ... />`)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx` (compute and pass `aiEnabled`)
- Test: `__tests__/components/proposals/ProposalAiPanel.test.tsx`

**Interfaces:**
- Consumes: `generateProposalDraft` from `@/actions/proposal-ai` (mocked in tests), `DraftResult`
- Produces: `ProposalAiPanel({ orgId, proposalId, hasBlocks, disabled, onApply })` where `onApply(blocks: ProposalBlock[], mode: 'use' | 'append' | 'replace'): void`
- `ProposalBlockEditor` gains `aiEnabled?: boolean` (default false) and `ProposalEditorClient` gains the same, passed from the page as `aiEnabled={!!process.env.ANTHROPIC_API_KEY}` (a server component reading a server-only var — this inlines only a boolean, never the key).

Behavior (per spec):
- Textarea for notes → **Generate draft** (loading state while awaiting).
- Returned blocks render as a read-only preview list plus the rationale and any `adjustments`.
- No existing blocks → single **Use draft** button.
- Existing blocks → **Append** (default-styled) and **Replace** (requires `window.confirm`) — the destructive option is never the reflex action.
- On apply, ids are re-minted by the block editor (`ai-<n>` via its existing counter pattern) so model-supplied ids can never collide with existing block ids.
- Errors from the action render in the panel (`role="alert"`), matching editor conventions.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/components/proposals/ProposalAiPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const generateProposalDraft = vi.fn()
vi.mock('@/actions/proposal-ai', () => ({
  generateProposalDraft: (...a: unknown[]) => generateProposalDraft(...a),
}))

import { ProposalAiPanel } from '@/components/admin/ProposalAiPanel'

const DRAFT = {
  blocks: [{ id: 'x1', type: 'paragraph', text: 'Drafted paragraph' }],
  suggested_package_ids: ['wp-a'],
  rationale: 'Because the notes mentioned coffee.',
  adjustments: ['Dropped a suggested package not in your catalog: "wp-ghost".'],
}

beforeEach(() => {
  vi.clearAllMocks()
  generateProposalDraft.mockResolvedValue(DRAFT)
})

describe('ProposalAiPanel', () => {
  it('generates and shows the preview, rationale, and adjustments', async () => {
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={vi.fn()} />)
    await user.type(screen.getByLabelText(/notes/i), 'client wants a coffee cart')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(generateProposalDraft).toHaveBeenCalledWith('o1', 'p1', 'client wants a coffee cart')
    expect(await screen.findByText('Drafted paragraph')).toBeInTheDocument()
    expect(screen.getByText(/because the notes mentioned coffee/i)).toBeInTheDocument()
    expect(screen.getByText(/wp-ghost/)).toBeInTheDocument()
  })

  it('offers Use draft when the proposal has no blocks', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={onApply} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /use draft/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'use')
  })

  it('offers Append and confirm-gated Replace when blocks exist', async () => {
    const onApply = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={true} disabled={false} onApply={onApply} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /replace/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled() // confirm declined
    await user.click(screen.getByRole('button', { name: /append/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'append')
    confirmSpy.mockRestore()
  })

  it('shows action errors in an alert', async () => {
    generateProposalDraft.mockRejectedValue(new Error('Draft too long — shorten your notes.'))
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={vi.fn()} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/shorten your notes/i)
  })

  it('disables everything when disabled (locked proposal)', () => {
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={true} onApply={vi.fn()} />)
    expect(screen.getByLabelText(/notes/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/components/proposals/ProposalAiPanel.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the panel**

```tsx
// components/admin/ProposalAiPanel.tsx
'use client'

import { useState } from 'react'
import { generateProposalDraft } from '@/actions/proposal-ai'
import type { DraftResult } from '@/lib/ai/proposal-draft'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ProposalBlock } from '@/lib/types'

export function ProposalAiPanel({
  orgId, proposalId, hasBlocks, disabled, onApply,
}: {
  orgId: string
  proposalId: string
  hasBlocks: boolean
  disabled: boolean
  onApply: (blocks: ProposalBlock[], mode: 'use' | 'append' | 'replace') => void
}) {
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      setDraft(await generateProposalDraft(orgId, proposalId, notes))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function replace() {
    if (!draft) return
    if (!window.confirm('Replace the existing document with this draft?')) return
    onApply(draft.blocks, 'replace')
    setDraft(null)
  }

  return (
    <div className="rounded border p-3 space-y-2">
      <Label htmlFor="ai-notes">Notes for AI draft</Label>
      <textarea
        id="ai-notes"
        rows={4}
        className="w-full rounded border p-2 text-sm"
        placeholder="Paste call notes, an email thread, or a transcript…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={disabled || generating}
      />
      <Button type="button" onClick={generate} disabled={disabled || generating || !notes.trim()}>
        {generating ? 'Generating…' : 'Generate draft'}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {draft && (
        <div className="space-y-2">
          <div className="rounded bg-muted p-2 text-sm space-y-1">
            {draft.blocks.map((b) => (
              <p key={b.id}>
                {b.type === 'heading' && <strong>{b.text}</strong>}
                {b.type === 'paragraph' && b.text}
                {b.type === 'list' && b.items.join(' • ')}
                {b.type === 'testimonial' && <em>“{b.quote}”</em>}
              </p>
            ))}
          </div>
          {draft.rationale && <p className="text-xs text-muted-foreground">{draft.rationale}</p>}
          {draft.adjustments.map((a, i) => (
            <p key={i} className="text-xs text-amber-700">{a}</p>
          ))}
          <div className="flex gap-2">
            {hasBlocks ? (
              <>
                <Button type="button" size="sm" onClick={() => { onApply(draft.blocks, 'append'); setDraft(null) }}>
                  Append
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={replace}>
                  Replace
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => { onApply(draft.blocks, 'use'); setDraft(null) }}>
                Use draft
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

Wire into `ProposalBlockEditor` (`components/admin/ProposalBlockEditor.tsx`): add `aiEnabled = false` to the props, and render the panel above the block list:

```tsx
{aiEnabled && (
  <ProposalAiPanel
    orgId={orgId}
    proposalId={proposalId}
    hasBlocks={blocks.length > 0}
    disabled={disabled}
    onApply={(draftBlocks, mode) => {
      // Re-mint ids through the editor's own counter so a model-supplied id
      // can never collide with an existing block id (same invariant as
      // nextNewBlockId for hand-added blocks).
      const reminted = draftBlocks.map((b) => {
        const id = `new-${nextIdRef.current}`
        nextIdRef.current += 1
        return { ...b, id }
      })
      setBlocks((prev) => (mode === 'append' ? [...prev, ...reminted] : reminted))
    }}
  />
)}
```

`'use'` and `'replace'` both resolve to full replacement here — the distinction is purely which buttons the panel shows. Thread the prop: `ProposalEditorClient` gains `aiEnabled?: boolean` and passes it at line ~430 (`<ProposalBlockEditor ... aiEnabled={aiEnabled} />`); the page (`app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx`) passes `aiEnabled={!!process.env.ANTHROPIC_API_KEY}` to `ProposalEditorClient`.

- [ ] **Step 4: Run tests to verify they pass, plus the existing editor tests**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' __tests__/components/proposals/ __tests__/actions/proposal-blocks.test.ts`
Expected: PASS — new panel tests plus all pre-existing proposal component tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ProposalAiPanel.tsx components/admin/ProposalBlockEditor.tsx components/admin/ProposalEditorClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx" __tests__/components/proposals/ProposalAiPanel.test.tsx
git commit -m "feat(ai): Generate draft panel in the proposal block editor, gated on ANTHROPIC_API_KEY"
```

---

### Task 7: Green gate + wrap-up

**Files:**
- None new — verification only.

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: clean. If the SDK request cast from Task 5 errs, fix per the note there.

- [ ] **Step 2: Full test suite (inside the worktree)**

Run: `npx vitest run --exclude '**/.claude/**' --exclude '**/.worktrees/**' 2>&1 | tail -5`
Expected: all files pass — baseline 1058 tests plus ~31 new.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds. This catches the `'use server'` re-export class of failure that tsc misses. Confirm the proposals editor route compiles in the output.

- [ ] **Step 4: Manual smoke note (no key vs key)**

With `ANTHROPIC_API_KEY` unset in `.env.local`, the editor must render with no AI panel and no errors. With a key set, the panel renders. (Live generation is NOT part of the gate — no live API calls required to land this.)

- [ ] **Step 5: Final commit if any fixups, then report**

```bash
git status
git log --oneline main..HEAD
```

Branch is ready for review/merge per superpowers:finishing-a-development-branch. Do not push without switching to the Lifewithmo gh account first (`gh auth switch`).
