# Proposal Document (Increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a proposal a document — an ordered list of content blocks (heading, paragraph, list, image, testimonial) that an admin edits, a customer reads above the pricing section, and either party can print to PDF.

**Architecture:** Additive and back-compatible. One new optional field, `blocks?: ProposalBlock[]`, on the existing `Proposal`. All block validation and inline-markdown parsing lives in a pure, dependency-free module (`lib/proposals/blocks.ts`) that is unit-tested in isolation; a guard-free core persists, and a `'use server'` action wraps it with `assertOrgAdmin` and the existing signed-proposal lock. The public page reaches blocks through the existing `PublicProposal` allowlist projection, which must be extended deliberately. The pricing, selection, signature and deposit machinery is not touched.

**Tech Stack:** Next.js 16 App Router (server actions; `params` is a Promise), React 19, Firebase Admin (Firestore + Storage), Vitest + @testing-library/react, TypeScript strict. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-06-proposal-presentation-design.md`](../specs/2026-08-06-proposal-presentation-design.md)

## Global Constraints

- **Green gate is three commands**, all run from inside this worktree: `npx tsc --noEmit`, `npx vitest run --exclude '**/.claude/**'`, and `npm run build`. The build is not optional — a `'use server'` type re-export passes `tsc` and breaks `next build`.
- **Never run vitest from the primary checkout** (`/Users/rm/vw/traxevent`) — it scans nested worktrees and produces thousands of phantom failures. Work only in `/Users/rm/vw/traxevent/.claude/worktrees/proposal-presentation`.
- **No new npm dependencies.** No zod, no markdown library, no drag-and-drop library.
- **Never use `dangerouslySetInnerHTML`.** The public proposal page is unauthenticated and its content will later be model-generated.
- **All types live in `lib/types.ts`.** Never re-export a type from a `'use server'` module.
- **Do not modify the pricing/selection/signature/deposit logic**: `lib/proposals.ts` money helpers, the deposit webhook, or any existing state, handler, or JSX of the pricing UI inside `ProposalResponseClient`. Tasks 7 and 8 do edit that file, but only **additively** — two new lines rendering `<ProposalDocument>` and a Download PDF link. Task 9 adds one guard to `signProposal`. Nothing else in those paths changes.
- Money stays in dollars; timestamps are ISO strings from `new Date().toISOString()`.

## Two spec corrections locked in here

1. **`ProposalDocument` is a plain presentational component, not a server component.** The spec called it a server component, but the public page renders `ProposalResponseClient`, which is `'use client'` — a server component cannot be imported into a client component. `ProposalDocument` therefore has no hooks, no async, and no server-only imports, and it does ship in the client bundle (pure functions, a few KB). It still works unchanged inside the true server component used by the print route.
2. **`PublicProposal` must be extended explicitly.** `getPublicProposal` builds a hand-written allowlist projection specifically so `token` / `org_id` / `lead_id` / `id` are structurally absent. Blocks are invisible to the public page until added there — Task 3.

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` (modify) | `ProposalBlock` union, `PROPOSAL_BLOCK_TYPES`, `blocks?` on `Proposal` |
| `lib/proposals/blocks.ts` (create) | Pure: `normalizeBlocks`, caps, `parseInline`. No imports beyond types. |
| `lib/proposals/blocks-core.ts` (create) | `updateProposalBlocksCore` — guard-free Firestore write |
| `actions/proposals.ts` (modify) | `updateProposalBlocks` — `assertOrgAdmin` + signed lock, delegates to core |
| `actions/proposals-public.ts` (modify) | Add `blocks` to `PublicProposal` and the projection |
| `actions/proposal-images.ts` (create) | `uploadProposalImage` — admin-SDK upload |
| `components/proposals/ProposalDocument.tsx` (create) | Renders blocks to semantic HTML |
| `components/admin/ProposalBlockEditor.tsx` (create) | Add / edit / reorder / delete blocks |
| `components/proposals/ProposalResponseClient.tsx` (modify) | Render the document above pricing |
| `components/admin/ProposalEditorClient.tsx` (modify) | Mount the block editor |
| `app/(public)/proposals/[token]/print/page.tsx` (create) | Print view |

---

### Task 1: Block types and pure helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/proposals/blocks.ts`
- Test: `__tests__/lib/proposal-blocks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProposalBlock`, `PROPOSAL_BLOCK_TYPES`, `Proposal.blocks?`; `normalizeBlocks(input: unknown): { blocks: ProposalBlock[]; adjustments: string[] }`; `parseInline(text: string): InlineToken[]`; constants `MAX_BLOCKS`, `MAX_PARAGRAPH_CHARS`, `MAX_LIST_ITEMS`, `MAX_LIST_ITEM_CHARS`.

- [ ] **Step 1: Add the types to `lib/types.ts`**

Add immediately after the `ProposalLineItem` interface (around line 442):

```ts
export const PROPOSAL_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'image', 'testimonial'] as const
export type ProposalBlockType = (typeof PROPOSAL_BLOCK_TYPES)[number]

export type ProposalBlock =
  | { id: string; type: 'heading'; text: string; level?: 2 | 3 }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'list'; items: string[]; ordered?: boolean }
  | { id: string; type: 'image'; url: string; alt?: string; caption?: string }
  | { id: string; type: 'testimonial'; quote: string; attribution?: string }
```

Then add one line to the existing `Proposal` interface, directly under `notes?: string`:

```ts
  blocks?: ProposalBlock[]     // document content, rendered above the pricing section
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/lib/proposal-blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeBlocks, parseInline,
  MAX_BLOCKS, MAX_PARAGRAPH_CHARS, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS,
} from '@/lib/proposals/blocks'

describe('normalizeBlocks', () => {
  it('returns empty for non-array input', () => {
    expect(normalizeBlocks(undefined).blocks).toEqual([])
    expect(normalizeBlocks('nope').blocks).toEqual([])
  })

  it('keeps a valid block of each type', () => {
    const input = [
      { id: 'a', type: 'heading', text: 'Hi', level: 2 },
      { id: 'b', type: 'paragraph', text: 'Body' },
      { id: 'c', type: 'list', items: ['one', 'two'], ordered: true },
      { id: 'd', type: 'image', url: 'https://x/y.png', alt: 'Y' },
      { id: 'e', type: 'testimonial', quote: 'Great', attribution: 'Dana' },
    ]
    const { blocks, adjustments } = normalizeBlocks(input)
    expect(blocks).toHaveLength(5)
    expect(adjustments).toEqual([])
  })

  it('drops unknown block types and reports it', () => {
    const { blocks, adjustments } = normalizeBlocks([{ id: 'a', type: 'video', url: 'x' }])
    expect(blocks).toEqual([])
    expect(adjustments[0]).toMatch(/video/)
  })

  it('drops blocks whose required fields are missing or blank', () => {
    const { blocks } = normalizeBlocks([
      { id: 'a', type: 'heading', text: '   ' },
      { id: 'b', type: 'image' },
      { id: 'c', type: 'list', items: [] },
    ])
    expect(blocks).toEqual([])
  })

  it('assigns an id when missing and de-duplicates repeats', () => {
    const { blocks } = normalizeBlocks([
      { type: 'paragraph', text: 'one' },
      { id: 'dup', type: 'paragraph', text: 'two' },
      { id: 'dup', type: 'paragraph', text: 'three' },
    ])
    expect(blocks[0].id).toBe('blk-0')
    expect(blocks[1].id).toBe('dup')
    expect(blocks[2].id).toBe('blk-2')
  })

  it('truncates to MAX_BLOCKS and reports it', () => {
    const many = Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({
      id: `b${i}`, type: 'paragraph', text: 'x',
    }))
    const { blocks, adjustments } = normalizeBlocks(many)
    expect(blocks).toHaveLength(MAX_BLOCKS)
    expect(adjustments.some((a) => a.includes(String(MAX_BLOCKS)))).toBe(true)
  })

  it('truncates an over-long paragraph', () => {
    const { blocks, adjustments } = normalizeBlocks([
      { id: 'a', type: 'paragraph', text: 'x'.repeat(MAX_PARAGRAPH_CHARS + 10) },
    ])
    expect((blocks[0] as { text: string }).text).toHaveLength(MAX_PARAGRAPH_CHARS)
    expect(adjustments).toHaveLength(1)
  })

  it('truncates list length and each item', () => {
    const { blocks } = normalizeBlocks([{
      id: 'a', type: 'list',
      items: Array.from({ length: MAX_LIST_ITEMS + 3 }, () => 'y'.repeat(MAX_LIST_ITEM_CHARS + 4)),
    }])
    const list = blocks[0] as { items: string[] }
    expect(list.items).toHaveLength(MAX_LIST_ITEMS)
    expect(list.items[0]).toHaveLength(MAX_LIST_ITEM_CHARS)
  })

  it('coerces an invalid heading level to 2', () => {
    const { blocks } = normalizeBlocks([{ id: 'a', type: 'heading', text: 'T', level: 7 }])
    expect((blocks[0] as { level?: number }).level).toBe(2)
  })

  it('rejects an image url that is not http(s)', () => {
    const { blocks } = normalizeBlocks([
      { id: 'a', type: 'image', url: 'javascript:alert(1)' },
      { id: 'b', type: 'image', url: 'data:text/html,<script>' },
    ])
    expect(blocks).toEqual([])
  })
})

describe('parseInline', () => {
  it('returns one plain token for plain text', () => {
    expect(parseInline('hello')).toEqual([{ text: 'hello' }])
  })

  it('parses bold and italic', () => {
    expect(parseInline('a **b** c *d*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', italic: true },
    ])
  })

  it('leaves unmatched markers literal', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }])
  })

  it('never emits html', () => {
    const tokens = parseInline('<script>alert(1)</script>')
    expect(tokens).toEqual([{ text: '<script>alert(1)</script>' }])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/proposal-blocks.test.ts`
Expected: FAIL — cannot resolve `@/lib/proposals/blocks`.

- [ ] **Step 4: Implement `lib/proposals/blocks.ts`**

```ts
import type { ProposalBlock } from '@/lib/types'

export const MAX_BLOCKS = 100
export const MAX_PARAGRAPH_CHARS = 5000
export const MAX_LIST_ITEMS = 50
export const MAX_LIST_ITEM_CHARS = 500

export interface NormalizeResult {
  blocks: ProposalBlock[]
  adjustments: string[]
}

export interface InlineToken {
  text: string
  bold?: boolean
  italic?: boolean
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isHttpUrl(v: unknown): boolean {
  const s = str(v)
  return /^https?:\/\//i.test(s)
}

/**
 * Validate and bound untrusted block input. Total size matters: the whole
 * proposal is one Firestore document with a 1MB ceiling, and the caps here
 * are the only enforcement point — the AI generation schema in increment 2
 * cannot express length constraints.
 *
 * Invalid blocks are dropped rather than throwing, and every change is
 * reported in `adjustments` so the caller can tell the user what happened.
 */
export function normalizeBlocks(input: unknown): NormalizeResult {
  const adjustments: string[] = []
  if (!Array.isArray(input)) return { blocks: [], adjustments }

  const capped = input.slice(0, MAX_BLOCKS)
  if (input.length > capped.length) {
    adjustments.push(`Kept the first ${MAX_BLOCKS} blocks and dropped ${input.length - MAX_BLOCKS}.`)
  }

  const seen = new Set<string>()
  const blocks: ProposalBlock[] = []

  capped.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const b = raw as Record<string, unknown>

    let id = str(b.id).trim()
    if (!id || seen.has(id)) id = `blk-${index}`
    seen.add(id)

    switch (b.type) {
      case 'heading': {
        const text = str(b.text).trim()
        if (!text) return
        const level = b.level === 3 ? 3 : 2
        blocks.push({ id, type: 'heading', text, level })
        return
      }
      case 'paragraph': {
        let text = str(b.text).trim()
        if (!text) return
        if (text.length > MAX_PARAGRAPH_CHARS) {
          text = text.slice(0, MAX_PARAGRAPH_CHARS)
          adjustments.push(`Shortened a paragraph to ${MAX_PARAGRAPH_CHARS} characters.`)
        }
        blocks.push({ id, type: 'paragraph', text })
        return
      }
      case 'list': {
        if (!Array.isArray(b.items)) return
        let items = b.items.map((i) => str(i).trim()).filter(Boolean)
        if (items.length === 0) return
        if (items.length > MAX_LIST_ITEMS) {
          items = items.slice(0, MAX_LIST_ITEMS)
          adjustments.push(`Shortened a list to ${MAX_LIST_ITEMS} items.`)
        }
        items = items.map((i) =>
          i.length > MAX_LIST_ITEM_CHARS ? i.slice(0, MAX_LIST_ITEM_CHARS) : i,
        )
        blocks.push({ id, type: 'list', items, ...(b.ordered === true ? { ordered: true } : {}) })
        return
      }
      case 'image': {
        if (!isHttpUrl(b.url)) return
        const alt = str(b.alt).trim()
        const caption = str(b.caption).trim()
        blocks.push({
          id, type: 'image', url: str(b.url),
          ...(alt ? { alt } : {}), ...(caption ? { caption } : {}),
        })
        return
      }
      case 'testimonial': {
        const quote = str(b.quote).trim()
        if (!quote) return
        const attribution = str(b.attribution).trim()
        blocks.push({ id, type: 'testimonial', quote, ...(attribution ? { attribution } : {}) })
        return
      }
      default:
        adjustments.push(`Dropped an unsupported block of type "${str(b.type) || 'unknown'}".`)
    }
  })

  return { blocks, adjustments }
}

/**
 * Parse the supported inline markdown subset (**bold**, *italic*) into tokens.
 * Returns data, never markup — the renderer turns tokens into React elements,
 * so generated text can never inject HTML.
 */
export function parseInline(text: string): InlineToken[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter((p) => p !== '')
  if (parts.length === 0) return [{ text: '' }]
  return parts.map((p) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return { text: p.slice(2, -2), bold: true }
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return { text: p.slice(1, -1), italic: true }
    }
    return { text: p }
  })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/proposal-blocks.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add lib/types.ts lib/proposals/blocks.ts __tests__/lib/proposal-blocks.test.ts
git commit -m "feat(proposals): block types + pure normalization and inline parsing"
```

---

### Task 2: Persist blocks

**Files:**
- Create: `lib/proposals/blocks-core.ts`
- Modify: `actions/proposals.ts`
- Test: `__tests__/actions/proposal-blocks.test.ts`

**Interfaces:**
- Consumes: `normalizeBlocks` from Task 1.
- Produces: `updateProposalBlocksCore(orgId: string, proposalId: string, blocks: unknown): Promise<{ adjustments: string[] }>` and the action `updateProposalBlocks(orgId, proposalId, blocks)` with the same return type.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/proposal-blocks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn()
const get = vi.fn()
const doc = vi.fn(() => ({ get, update }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }) },
}))

import { updateProposalBlocksCore } from '@/lib/proposals/blocks-core'

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
})

describe('updateProposalBlocksCore', () => {
  it('writes normalized blocks and stamps updated_at', async () => {
    const res = await updateProposalBlocksCore('o1', 'p1', [
      { id: 'a', type: 'paragraph', text: 'Hello' },
    ])
    expect(res.adjustments).toEqual([])
    const written = update.mock.calls[0][0]
    expect(written.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Hello' }])
    expect(typeof written.updated_at).toBe('string')
  })

  it('drops invalid blocks and reports the adjustment', async () => {
    const res = await updateProposalBlocksCore('o1', 'p1', [{ id: 'a', type: 'video' }])
    expect(update.mock.calls[0][0].blocks).toEqual([])
    expect(res.adjustments).toHaveLength(1)
  })

  it('refuses to edit a signed proposal', async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'p1', signature: { signer_name: 'Dana' } }),
    })
    await expect(updateProposalBlocksCore('o1', 'p1', [])).rejects.toThrow(/signed/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('throws when the proposal does not exist', async () => {
    get.mockResolvedValue({ exists: false })
    await expect(updateProposalBlocksCore('o1', 'p1', [])).rejects.toThrow(/not found/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/actions/proposal-blocks.test.ts`
Expected: FAIL — cannot resolve `@/lib/proposals/blocks-core`.

- [ ] **Step 3: Implement the core**

Create `lib/proposals/blocks-core.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { Proposal } from '@/lib/types'

/**
 * Guard-free block write. Mirrors lib/crm/invoices.ts: no auth assertions here
 * so an unauthenticated context (increment 2's generator preview) can compose it.
 * The caller is responsible for authorization.
 */
export async function updateProposalBlocksCore(
  orgId: string,
  proposalId: string,
  blocks: unknown,
): Promise<{ adjustments: string[] }> {
  const ref = adminDb.collection('orgs').doc(orgId).collection('proposals').doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')

  const data = snap.data() as Proposal
  if (data.signature || data.pending_signature) {
    throw new Error('This proposal is signed and can no longer be edited')
  }

  const { blocks: normalized, adjustments } = normalizeBlocks(blocks)
  await ref.update({ blocks: normalized, updated_at: new Date().toISOString() })
  return { adjustments }
}
```

- [ ] **Step 4: Add the guarded action**

In `actions/proposals.ts`, add this import alongside the existing ones:

```ts
import { updateProposalBlocksCore } from '@/lib/proposals/blocks-core'
```

and append this function at the end of the file:

```ts
export async function updateProposalBlocks(
  orgId: string,
  proposalId: string,
  blocks: unknown,
): Promise<{ adjustments: string[] }> {
  await assertOrgAdmin(orgId)
  return updateProposalBlocksCore(orgId, proposalId, blocks)
}
```

Do **not** add a `ProposalBlock` type re-export to this file — it is `'use server'`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run __tests__/actions/proposal-blocks.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add lib/proposals/blocks-core.ts actions/proposals.ts __tests__/actions/proposal-blocks.test.ts
git commit -m "feat(proposals): persist document blocks with the signed-proposal lock"
```

---

### Task 3: Expose blocks on the public projection

**Files:**
- Modify: `actions/proposals-public.ts`
- Test: `__tests__/actions/proposals-public.test.ts` (existing — add cases)

**Interfaces:**
- Consumes: `ProposalBlock` from Task 1.
- Produces: `PublicProposal.blocks?: ProposalBlock[]`.

This is the security-sensitive task. `getPublicProposal` builds a hand-written allowlist so `token`, `org_id`, `lead_id` and `id` are structurally absent from the response. Add exactly one field; do not switch to spreading the raw document.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/actions/proposals-public.test.ts` inside the existing `getPublicProposal` describe block. The file already provides a `mockSnapshot(data)` helper (defined near the top, built with `vi.hoisted` spies) — use it; do not add a new helper.

```ts
  it('exposes blocks when present', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      blocks: [{ id: 'a', type: 'paragraph', text: 'Hello' }],
    })
    const result = await getPublicProposal('tok')
    expect(result?.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Hello' }])
  })

  it('omits blocks entirely when the proposal has none', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
    })
    const result = await getPublicProposal('tok')
    expect('blocks' in (result as object)).toBe(false)
  })

  it('still never leaks token, org_id, lead_id or id', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      blocks: [{ id: 'a', type: 'paragraph', text: 'Hello' }],
    })
    const result = await getPublicProposal('tok') as Record<string, unknown>
    expect(result.token).toBeUndefined()
    expect(result.org_id).toBeUndefined()
    expect(result.lead_id).toBeUndefined()
    expect(result.id).toBeUndefined()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: FAIL — `result.blocks` is `undefined`.

- [ ] **Step 3: Extend the interface and the projection**

In `actions/proposals-public.ts`, add `ProposalBlock` to the existing type import from `@/lib/types`.

Add one line to the `PublicProposal` interface, directly under `notes?: string`:

```ts
  blocks?: ProposalBlock[]
```

Add one line to the projection in `getPublicProposal`, directly under the `notes` line:

```ts
  if (proposal.blocks !== undefined) publicProposal.blocks = proposal.blocks
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals-public.ts __tests__/actions/proposals-public.test.ts
git commit -m "feat(proposals): expose document blocks on the public projection"
```

---

### Task 4: The document renderer

**Files:**
- Create: `components/proposals/ProposalDocument.tsx`
- Test: `__tests__/components/proposals/ProposalDocument.test.tsx`

**Interfaces:**
- Consumes: `ProposalBlock` (Task 1), `parseInline` (Task 1).
- Produces: `<ProposalDocument blocks={blocks} />` where `blocks?: ProposalBlock[]`. Renders `null` when there are no blocks.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/proposals/ProposalDocument.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import type { ProposalBlock } from '@/lib/types'

describe('ProposalDocument', () => {
  it('renders nothing when there are no blocks', () => {
    const { container } = render(<ProposalDocument blocks={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when blocks is undefined', () => {
    const { container } = render(<ProposalDocument />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each block type', () => {
    const blocks: ProposalBlock[] = [
      { id: '1', type: 'heading', text: 'Why us', level: 2 },
      { id: '2', type: 'paragraph', text: 'We are **great**' },
      { id: '3', type: 'list', items: ['Coffee', 'Cart'] },
      { id: '4', type: 'image', url: 'https://x/y.png', alt: 'Our cart', caption: 'On site' },
      { id: '5', type: 'testimonial', quote: 'Superb', attribution: 'Dana' },
    ]
    render(<ProposalDocument blocks={blocks} />)

    expect(screen.getByRole('heading', { name: 'Why us', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('great').tagName).toBe('STRONG')
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Our cart' })).toHaveAttribute('src', 'https://x/y.png')
    expect(screen.getByText('On site')).toBeInTheDocument()
    expect(screen.getByText(/Superb/)).toBeInTheDocument()
    expect(screen.getByText(/Dana/)).toBeInTheDocument()
  })

  it('renders an ordered list as ol', () => {
    render(<ProposalDocument blocks={[{ id: '1', type: 'list', items: ['a'], ordered: true }]} />)
    expect(screen.getByRole('list').tagName).toBe('OL')
  })

  it('renders markup in text as literal characters, not html', () => {
    render(<ProposalDocument blocks={[
      { id: '1', type: 'paragraph', text: '<script>alert(1)</script>' },
    ]} />)
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/components/proposals/ProposalDocument.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the component**

Create `components/proposals/ProposalDocument.tsx`. Note: **no `'use client'` directive and no hooks** — it is a plain presentational component so it can be imported by both a client component (the public page) and a server component (the print route).

```tsx
import { parseInline } from '@/lib/proposals/blocks'
import type { ProposalBlock } from '@/lib/types'

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.bold) return <strong key={i}>{t.text}</strong>
        if (t.italic) return <em key={i}>{t.text}</em>
        return <span key={i}>{t.text}</span>
      })}
    </>
  )
}

function Block({ block }: { block: ProposalBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 3
        ? <h3 className="mt-6 mb-2 text-lg font-semibold text-gray-900"><Inline text={block.text} /></h3>
        : <h2 className="mt-8 mb-3 text-xl font-bold text-gray-900"><Inline text={block.text} /></h2>
    case 'paragraph':
      return <p className="mb-4 leading-relaxed text-gray-700"><Inline text={block.text} /></p>
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="mb-1"><Inline text={item} /></li>
      ))
      return block.ordered
        ? <ol className="mb-4 list-decimal pl-6 text-gray-700">{items}</ol>
        : <ul className="mb-4 list-disc pl-6 text-gray-700">{items}</ul>
    }
    case 'image':
      return (
        <figure className="mb-6">
          {/* Plain <img> is deliberate: next.config.ts has no images.remotePatterns,
              and next/image would couple it to the storage bucket domain. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt ?? ''} loading="lazy" className="w-full rounded-md" />
          {block.caption && (
            <figcaption className="mt-2 text-sm text-gray-500">{block.caption}</figcaption>
          )}
        </figure>
      )
    case 'testimonial':
      return (
        <blockquote className="mb-6 border-l-4 border-gray-300 pl-4 italic text-gray-700">
          <p className="mb-1"><Inline text={block.quote} /></p>
          {block.attribution && (
            <cite className="text-sm not-italic text-gray-500">— {block.attribution}</cite>
          )}
        </blockquote>
      )
  }
}

export function ProposalDocument({ blocks }: { blocks?: ProposalBlock[] }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="mb-8">
      {blocks.map((b) => <Block key={b.id} block={b} />)}
    </div>
  )
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run __tests__/components/proposals/ProposalDocument.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit && npx eslint components/proposals/ProposalDocument.tsx` — expected clean (the `no-img-element` rule is disabled inline with a comment explaining why).

- [ ] **Step 5: Commit**

```bash
git add components/proposals/ProposalDocument.tsx __tests__/components/proposals/ProposalDocument.test.tsx
git commit -m "feat(proposals): document renderer for content blocks"
```

---

### Task 5: Image upload action

**Files:**
- Create: `actions/proposal-images.ts`
- Test: `__tests__/actions/proposal-images.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `uploadProposalImage(orgId: string, proposalId: string, formData: FormData): Promise<{ url: string }>`.

Mirrors `uploadEvidencePhoto` in `actions/ops-evidence.ts`. Unlike ops evidence — where public-by-obscure-URL is a documented tradeoff — proposal images are *meant* to be publicly viewable, so `makePublic()` is simply correct here.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/proposal-images.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const save = vi.fn()
const makePublic = vi.fn()
const publicUrl = vi.fn(() => 'https://storage/x.png')
const file = vi.fn(() => ({ save, makePublic, publicUrl }))

vi.mock('@/lib/firebase-admin', () => ({ adminBucket: { file } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn() }))

import { uploadProposalImage } from '@/actions/proposal-images'
import { assertOrgAdmin } from '@/lib/auth/assert'

function fd(f: unknown): FormData {
  const form = new FormData()
  if (f) form.set('file', f as Blob)
  return form
}

beforeEach(() => vi.clearAllMocks())

describe('uploadProposalImage', () => {
  it('uploads an image and returns its public url', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'my photo.png', { type: 'image/png' })
    const res = await uploadProposalImage('o1', 'p1', fd(png))
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(file.mock.calls[0][0]).toMatch(/^proposal-images\/o1\/p1\/\d+-my_photo\.png$/)
    expect(makePublic).toHaveBeenCalled()
    expect(res).toEqual({ url: 'https://storage/x.png' })
  })

  it('rejects a non-image file', async () => {
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    await expect(uploadProposalImage('o1', 'p1', fd(txt))).rejects.toThrow(/image/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a file over 8MB', async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' })
    await expect(uploadProposalImage('o1', 'p1', fd(big))).rejects.toThrow(/8MB/i)
  })

  it('rejects a missing file', async () => {
    await expect(uploadProposalImage('o1', 'p1', fd(null))).rejects.toThrow(/no file/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/actions/proposal-images.test.ts`
Expected: FAIL — cannot resolve `@/actions/proposal-images`.

- [ ] **Step 3: Implement the action**

Create `actions/proposal-images.ts`:

```ts
'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Upload a proposal document image and return a stable public URL.
 *
 * Unlike ops evidence photos (where public-by-obscure-URL is a documented
 * tradeoff), proposal images are intended to be visible to anyone holding the
 * proposal link, so makePublic() is the correct behavior rather than a
 * compromise.
 */
export async function uploadProposalImage(
  orgId: string,
  proposalId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)

  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('No file provided')
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.size > MAX_BYTES) throw new Error('Image must be under 8MB')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `proposal-images/${orgId}/${proposalId}/${Date.now()}-${safeName}`
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  })
  await blob.makePublic()
  return { url: blob.publicUrl() }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run __tests__/actions/proposal-images.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add actions/proposal-images.ts __tests__/actions/proposal-images.test.ts
git commit -m "feat(proposals): image upload for document blocks"
```

---

### Task 6: The block editor

**Files:**
- Create: `components/admin/ProposalBlockEditor.tsx`
- Test: `__tests__/components/admin/ProposalBlockEditor.test.tsx`

**Interfaces:**
- Consumes: `ProposalBlock` (Task 1), `updateProposalBlocks` (Task 2), `uploadProposalImage` (Task 5).
- Produces: `<ProposalBlockEditor orgId proposalId initialBlocks />`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/admin/ProposalBlockEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposalBlockEditor } from '@/components/admin/ProposalBlockEditor'

vi.mock('@/actions/proposals', () => ({
  updateProposalBlocks: vi.fn().mockResolvedValue({ adjustments: [] }),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))

import { updateProposalBlocks } from '@/actions/proposals'

const base = { orgId: 'o1', proposalId: 'p1' }

beforeEach(() => vi.clearAllMocks())

describe('ProposalBlockEditor', () => {
  it('shows an empty state when there are no blocks', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[]} />)
    expect(screen.getByText(/no content yet/i)).toBeInTheDocument()
  })

  it('adds a paragraph block', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add paragraph' }))
    expect(screen.getByLabelText('Paragraph 1')).toBeInTheDocument()
  })

  it('edits a paragraph and saves', async () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Old' },
    ]} />)
    fireEvent.change(screen.getByLabelText('Paragraph 1'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(updateProposalBlocks).toHaveBeenCalledWith('o1', 'p1', [
      { id: 'a', type: 'paragraph', text: 'New' },
    ]))
  })

  it('moves a block down', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'First' },
      { id: 'b', type: 'paragraph', text: 'Second' },
    ]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(areas[0].value).toBe('Second')
  })

  it('deletes a block after confirming', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Bye' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete block' }))
    expect(screen.getByText(/no content yet/i)).toBeInTheDocument()
  })

  it('surfaces a save error', async () => {
    vi.mocked(updateProposalBlocks).mockRejectedValueOnce(new Error('nope'))
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'x' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument())
  })

  it('reports adjustments returned by the server', async () => {
    vi.mocked(updateProposalBlocks).mockResolvedValueOnce({ adjustments: ['Shortened a paragraph.'] })
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'x' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText(/Shortened a paragraph/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/components/admin/ProposalBlockEditor.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the editor**

Create `components/admin/ProposalBlockEditor.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { updateProposalBlocks } from '@/actions/proposals'
import { uploadProposalImage } from '@/actions/proposal-images'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProposalBlock, ProposalBlockType } from '@/lib/types'

const LABELS: Record<ProposalBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  image: 'Image',
  testimonial: 'Testimonial',
}

function blankBlock(type: ProposalBlockType, id: string): ProposalBlock {
  switch (type) {
    case 'heading': return { id, type: 'heading', text: '', level: 2 }
    case 'paragraph': return { id, type: 'paragraph', text: '' }
    case 'list': return { id, type: 'list', items: [''] }
    case 'image': return { id, type: 'image', url: '' }
    case 'testimonial': return { id, type: 'testimonial', quote: '' }
  }
}

export function ProposalBlockEditor({
  orgId, proposalId, initialBlocks,
}: {
  orgId: string
  proposalId: string
  initialBlocks: ProposalBlock[]
}) {
  const [blocks, setBlocks] = useState<ProposalBlock[]>(initialBlocks)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [nextId, setNextId] = useState(0)

  function add(type: ProposalBlockType) {
    setBlocks((b) => [...b, blankBlock(type, `new-${nextId}`)])
    setNextId((n) => n + 1)
  }

  // One documented cast, here rather than at every call site. Spreading a
  // partial onto a discriminated union cannot be expressed type-safely in
  // TypeScript; callers only ever pass fields that exist on the block they
  // are editing, and normalizeBlocks re-validates everything server-side.
  function patch(index: number, changes: Record<string, unknown>) {
    setBlocks((b) => b.map((blk, i) => (i === index ? ({ ...blk, ...changes } as ProposalBlock) : blk)))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= blocks.length) return
    setBlocks((b) => {
      const next = [...b]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function remove(index: number) {
    if (!window.confirm('Delete this block?')) return
    setBlocks((b) => b.filter((_, i) => i !== index))
  }

  async function pickImage(index: number, file: File) {
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const { url } = await uploadProposalImage(orgId, proposalId, form)
      patch(index, { url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { adjustments } = await updateProposalBlocks(orgId, proposalId, blocks)
      setNotice(adjustments.length ? adjustments.join(' ') : 'Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {blocks.length === 0 && (
        <p className="text-sm text-gray-500">No content yet. Add a block to start the document.</p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-gray-500">{LABELS[block.type]}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" aria-label="Move up"
                onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
              <Button type="button" variant="outline" size="sm" aria-label="Move down"
                onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</Button>
              <Button type="button" variant="outline" size="sm" aria-label="Delete block"
                onClick={() => remove(i)}>Delete</Button>
            </div>
          </div>

          {block.type === 'heading' && (
            <Input aria-label={`Heading ${i + 1}`} value={block.text}
              onChange={(e) => patch(i, { text: e.target.value })} />
          )}

          {block.type === 'paragraph' && (
            <textarea aria-label={`Paragraph ${i + 1}`} rows={4} value={block.text}
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(e) => patch(i, { text: e.target.value })} />
          )}

          {block.type === 'list' && (
            <textarea aria-label={`List ${i + 1}`} rows={4} value={block.items.join('\n')}
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(e) => patch(i, { items: e.target.value.split('\n') })} />
          )}

          {block.type === 'image' && (
            <div className="space-y-2">
              <input type="file" accept="image/*" aria-label={`Image ${i + 1}`}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(i, f) }} />
              {block.url && <p className="truncate text-xs text-gray-500">{block.url}</p>}
              <Input aria-label={`Image ${i + 1} alt text`} placeholder="Alt text"
                value={block.alt ?? ''}
                onChange={(e) => patch(i, { alt: e.target.value })} />
            </div>
          )}

          {block.type === 'testimonial' && (
            <div className="space-y-2">
              <textarea aria-label={`Testimonial ${i + 1}`} rows={3} value={block.quote}
                className="w-full rounded-md border px-3 py-2 text-sm"
                onChange={(e) => patch(i, { quote: e.target.value })} />
              <Input aria-label={`Testimonial ${i + 1} attribution`} placeholder="Attribution"
                value={block.attribution ?? ''}
                onChange={(e) => patch(i, { attribution: e.target.value })} />
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as ProposalBlockType[]).map((t) => (
          <Button key={t} type="button" variant="outline" size="sm"
            onClick={() => add(t)}>{`Add ${t}`}</Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="save-document" className="sr-only">Save document</Label>
        <Button id="save-document" type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save document'}
        </Button>
        {notice && <span className="text-sm text-gray-600">{notice}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run __tests__/components/admin/ProposalBlockEditor.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit && npx eslint components/admin/ProposalBlockEditor.tsx` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ProposalBlockEditor.tsx __tests__/components/admin/ProposalBlockEditor.test.tsx
git commit -m "feat(proposals): block editor for the proposal document"
```

---

### Task 7: Wire the editor and the public renderer

**Files:**
- Modify: `components/admin/ProposalEditorClient.tsx`
- Modify: `components/proposals/ProposalResponseClient.tsx`
- Test: `__tests__/components/proposals/ProposalDocument.test.tsx` (no change; covered by the build + manual walk)

**Interfaces:**
- Consumes: `ProposalBlockEditor` (Task 6), `ProposalDocument` (Task 4), `PublicProposal.blocks` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Mount the editor in the admin proposal editor**

In `components/admin/ProposalEditorClient.tsx`, add the import:

```tsx
import { ProposalBlockEditor } from '@/components/admin/ProposalBlockEditor'
```

Then add a new section in the returned JSX, immediately **before** the existing pricing/line-items section, wrapped in the same `Card` pattern the file already uses for its other sections:

```tsx
<Card className="mt-6">
  <CardHeader>
    <CardTitle>Document</CardTitle>
  </CardHeader>
  <CardContent>
    <ProposalBlockEditor
      orgId={orgId}
      proposalId={proposal.id}
      initialBlocks={proposal.blocks ?? []}
    />
  </CardContent>
</Card>
```

Match the exact `Card`/`CardHeader`/`CardTitle`/`CardContent` imports already present in the file. Do not change any existing pricing state or handlers.

- [ ] **Step 2: Render the document on the public page**

In `components/proposals/ProposalResponseClient.tsx`, add the import:

```tsx
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
```

Then insert one line directly **after** the `<h1>` and **before** the `{packaged && (` block:

```tsx
<ProposalDocument blocks={proposal.blocks} />
```

Change nothing else in this component.

- [ ] **Step 3: Verify the whole suite still passes**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS — the existing `ProposalResponseClient` tests must be unaffected, because a proposal without blocks renders `null`.

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 4: Commit**

```bash
git add components/admin/ProposalEditorClient.tsx components/proposals/ProposalResponseClient.tsx
git commit -m "feat(proposals): mount the block editor and render the document publicly"
```

---

### Task 8: Print route

**Files:**
- Create: `app/(public)/proposals/[token]/print/page.tsx`
- Modify: `components/proposals/ProposalResponseClient.tsx` (add the link)

**Interfaces:**
- Consumes: `getPublicProposal` (existing), `ProposalDocument` (Task 4), `PrintButton` (existing at `components/admin/ops/PrintButton.tsx`).
- Produces: the route `/proposals/[token]/print`.

- [ ] **Step 1: Create the print page**

Create `app/(public)/proposals/[token]/print/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import { lineItemSubtotal } from '@/lib/proposals'

export default async function ProposalPrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Same lookup as the main public page: the token is the authorization,
  // and drafts return null.
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 text-gray-900">
      <div className="mb-6 flex items-start justify-between">
        <h1 className="text-2xl font-bold">{proposal.title || 'Proposal'}</h1>
        <PrintButton />
      </div>

      <ProposalDocument blocks={proposal.blocks} />

      {proposal.line_items.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Pricing</h2>
          <table className="w-full text-sm">
            <tbody>
              {proposal.line_items.map((li, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1">{li.description}</td>
                  <td className="py-1 text-right">
                    {li.quantity} × ${li.unit_price.toFixed(2)}
                  </td>
                  <td className="py-1 text-right">${lineItemSubtotal(li).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {proposal.notes && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.notes}</p>
        </section>
      )}
    </main>
  )
}
```

`lineItemSubtotal(item: ProposalLineItem): number` is the existing exported helper in
`lib/proposals.ts` (verified). Do not compute `quantity * unit_price` inline — the helper
already guards against non-positive quantities and prices.

- [ ] **Step 2: Add the Download PDF link to the public page**

In `components/proposals/ProposalResponseClient.tsx`, directly after the `<h1>`, add:

```tsx
<a href={`/proposals/${token}/print`} target="_blank" rel="noreferrer"
   className="mb-6 inline-block text-sm text-gray-600 underline print:hidden">
  Download PDF
</a>
```

- [ ] **Step 3: Verify the route builds and renders**

Run: `npm run build`
Expected: clean, and `/proposals/[token]/print` appears in the route list.

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/proposals/[token]/print/page.tsx" components/proposals/ProposalResponseClient.tsx
git commit -m "feat(proposals): printable proposal view + Download PDF link"
```

---

### Task 9: Enforce proposal expiry

**Files:**
- Modify: `lib/types.ts` (comment only)
- Modify: `actions/proposals-public.ts`
- Test: `__tests__/actions/proposals-public.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports — `signProposal` now rejects an expired proposal.

`expires_at` is editable in the builder and displayed to the customer ("This proposal expires {date}") but never enforced — a customer can accept an expired proposal and it books. This is the adjacent fix approved in the spec.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/actions/proposals-public.test.ts`, in the `signProposal` describe block, using the file's existing `mockSnapshot(data)` helper.

The real signature is (verified):

```ts
signProposal(token: string, input: {
  signer_name: string; signer_email: string; consent: boolean;
  selection?: { package_id?: string; optional_item_ids?: string[] };
}): Promise<{ deposit_due: number; payment_status: PaymentStatus }>
```

```ts
  it('refuses to sign an expired proposal', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      expires_at: '2020-01-01T00:00:00.000Z',
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.com', consent: true }),
    ).rejects.toThrow(/expired/i)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('allows signing when the expiry is in the future', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      expires_at: '2999-01-01T00:00:00.000Z',
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.com', consent: true }),
    ).resolves.toBeDefined()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: FAIL — the expired case resolves instead of throwing.

- [ ] **Step 3: Add the guard**

In `actions/proposals-public.ts`, inside `signProposal`, immediately after the proposal is loaded and the existing status checks run, add:

```ts
  if (proposal.expires_at && new Date(proposal.expires_at).getTime() < Date.now()) {
    throw new Error('This proposal has expired. Please ask for an updated proposal.')
  }
```

Place it before any write occurs. Then update the comment on `lib/types.ts:466` from `display-only this increment` to:

```ts
  expires_at?: string          // ISO; enforced at signing time
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals-public.ts lib/types.ts __tests__/actions/proposals-public.test.ts
git commit -m "fix(proposals): reject signing an expired proposal"
```

---

### Task 10: Full verification pass

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: all green — the pre-existing baseline (880 as of PR #50) plus every test added by Tasks 1–9. Any pre-existing failure unrelated to this plan: STOP and report; do not paper over it.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: clean. This is the gate that catches a `'use server'` type re-export and any admin-SDK module leaking into the client bundle — `ProposalDocument` must import only `lib/proposals/blocks` (pure), never `blocks-core` (admin SDK).

- [ ] **Step 4: Manual walk against the emulators**

Two terminals, from this worktree:

```bash
npm run emulators
```

```bash
npm run dev:emulator
```

Note: `npm run emulators` and `npm run dev:emulator` currently exist only on the `claude/firebase-emulators` branch. If they are absent here, merge that branch first or run against a scratch Firebase project — **do not point at `traxevent-prod`**.

Walk the chain: create a lead → create a proposal → open the proposal editor → add a heading, a paragraph with `**bold**`, a list, an image (real upload), and a testimonial → reorder two blocks → Save → set status to `sent` → open the public token URL and confirm the document renders above the pricing section with the bold rendered and no raw markup → click **Download PDF** and confirm the print view renders → set `expires_at` to a past date and confirm signing is refused.

- [ ] **Step 5: Push**

```bash
git push -u origin claude/proposal-presentation
```
