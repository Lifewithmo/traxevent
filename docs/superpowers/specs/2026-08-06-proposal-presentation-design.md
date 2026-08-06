# Proposals — Presentation Layer + AI Drafting (Design)

**Date:** 2026-08-06
**Status:** approved in brainstorming; feeds the implementation plan.
**Worktree/branch:** `claude/proposal-presentation` (off `main`).
**Source:** [`docs/strategy/proposal_system_deep_analysis.md`](../../strategy/proposal_system_deep_analysis.md) — committed to the repo in this branch.
**Builds on:** proposals increments 1–3 (customer choice, commitment, deposit reconciliation) and ops-core (PR #46), which supplies the structured business data the generator is grounded in.

## Problem

The proposal is a transaction with no document. `Proposal` carries exactly two prose
fields — `title` and `notes`. The analysis's entire "Content" section (introduction,
customer problem, recommended solution, scope of work, timeline, images, testimonials,
terms, exclusions, assumptions) has no representation in the model.

Measured against the analysis's own MVP list, roughly 7 of 18 items are built, and the
missing ones skew hard toward everything the customer sees. The analysis names two failure
modes a proposal tool can fall into:

> 1. They create beautiful documents that do not become operational work.
> 2. They create operational quotes that do not effectively sell the value.

We built #2. Every increment so far optimized the money path; nobody built the document.

Three user-stated pains drive this work:

1. **It looks cheap to the customer** — the public page reads as an order form, not a pitch.
2. **Building one is tedious** — every proposal starts from a blank page.
3. **There's nothing to send or keep** — no PDF, no printable artifact.

Deliberately *not* in scope: cost/margin visibility. The user considered and declined it.

## Decomposition

Four subsystems, sequenced by hard dependency. This spec covers **increments 1 and 2**;
3 and 4 are sketched for context and get their own specs.

| # | Increment | Status |
|---|---|---|
| 1 | **The document** — block model, editor, public renderer, print route | **This spec** |
| 2 | **AI draft** — notes → blocks + suggested catalog packages, grounded | **This spec** |
| 3 | Brand kit — logo, accent, secondary, font, cover image + theming | Later spec |
| 4 | Scope check, follow-up drafting, thin save-as-template | Later spec |

**Why this order.** AI generates blocks, so the block model must exist first — there is no
way to draft into a shape that does not exist. AI is placed at #2 rather than last because
it is the highest-value item and the first moment it is buildable.

Increments 1 and 2 are specified together because the block shape and the generator that
writes into it should be designed once, not twice. They still get **separate implementation
plans and separate merges** — increment 1 is shippable on its own and should not wait on
increment 2.

**Templates were cut.** Built-in per-pack template content and AI drafting solve the same
pain (the blank page); a draft generated from real call notes beats a generic skeleton. Only
a thin "Save as template" survives, deferred to increment 4.

**External dependency:** image blocks (increment 1) and the logo/cover image (increment 3)
require Cloud Storage, which is **not provisioned on `traxevent-prod`** — neither
`traxevent-prod.firebasestorage.app` nor the legacy `.appspot.com` bucket exists, while
Firestore works on the same credentials, so Storage was simply never enabled. Fixing it
needs Firebase console owner access, plus a decision on uniform bucket-level access because
the upload path calls `makePublic()`.

Both are buildable and testable against the Firebase emulator today; neither can go live
until a bucket exists. This does not block increment 2.

> Full write-up lives at `docs/ops/firebase-storage-provisioning.md` on the **unmerged**
> `claude/firebase-emulators` branch — not linked here because it does not exist on `main`.

---

# Increment 1 — The document

## Data model

Five block types as a discriminated union, in `lib/types.ts` alongside the existing
proposal types:

```ts
export type ProposalBlock =
  | { id: string; type: 'heading';     text: string; level?: 2 | 3 }
  | { id: string; type: 'paragraph';   text: string }
  | { id: string; type: 'list';        items: string[]; ordered?: boolean }
  | { id: string; type: 'image';       url: string; alt?: string; caption?: string }
  | { id: string; type: 'testimonial'; quote: string; attribution?: string }
```

One new optional field on `Proposal`:

```ts
blocks?: ProposalBlock[]
```

Array order **is** document order; reordering moves an element within the array. `id` is a
stable per-block identifier used for React keys and for reporting which blocks the
generator produced. The field is additive and optional, so every existing proposal document
remains valid — the same back-compatible approach increments 1–3 used.

### Rendering position

Blocks render **above** the existing pricing UI. The public page becomes:

```
document blocks → Choose an option → What's included → Optional add-ons → Notes → sign
```

The selection, signature, and deposit machinery is **not touched**. `notes` is unchanged
and keeps its current position and role.

### Rich text

"Rich paragraph" means a minimal markdown subset — `**bold**` and `*italic*` only — parsed
by a pure function into React elements.

**`dangerouslySetInnerHTML` is never used.** The public proposal page is unauthenticated,
and its content will be part admin-authored and part model-generated. Rendering generated
text as HTML would be an injection hole with an LLM on the writing end. Parsing to React
nodes closes it structurally rather than by sanitising.

### Caps

Enforced in `normalizeBlocks`, not in the type:

| Limit | Value |
|---|---|
| Blocks per proposal | 100 |
| Characters per paragraph | 5,000 |
| Items per list | 50 |
| Characters per list item | 500 |

Firestore's 1 MB document limit is a live hazard in this repo — the ops `change_log` is
unbounded and already sits in the deferred-items ledger as something to cap "before events
accumulate hundreds of edits." Blocks carry the same risk, and AI generation makes hitting
it far likelier than hand-typing would.

Caps are also the **only** enforcement point available: structured outputs do not support
`minLength` / `maxLength` / array-length constraints, so the generation schema in increment
2 physically cannot express them (see "Structured output" below).

### Images

Mirrors `uploadEvidencePhoto` in [`actions/ops-evidence.ts`](../../../actions/ops-evidence.ts):
admin-SDK upload, MIME and size guards, sanitised filename, `makePublic()`.

Path: `proposal-images/{orgId}/{proposalId}/{timestamp}-{safeName}`.

The security posture **inverts** relative to ops evidence. There, public-by-obscure-URL is a
documented tradeoff. Here it is simply correct: proposal images are meant to be seen by
anyone holding the proposal link.

## Modules

| File | Contents | Depends on |
|---|---|---|
| `lib/proposals/blocks.ts` | Pure: type guards, `normalizeBlocks`, cap enforcement, markdown-subset tokenizer | nothing |
| `lib/proposals/blocks-core.ts` | `updateProposalBlocksCore` — guard-free, Firestore | `blocks.ts`, admin SDK |
| `actions/proposals.ts` | `updateProposalBlocks` — `assertOrgAdmin`, delegates to the core | existing file |
| `actions/proposal-images.ts` | `uploadProposalImage` — `assertOrgAdmin`, admin-SDK upload | admin SDK |
| `components/proposals/ProposalDocument.tsx` | Server component, renders blocks | `blocks.ts` |
| `components/admin/ProposalBlockEditor.tsx` | Client — add / reorder / edit / delete | new file |
| `app/(public)/proposals/[token]/print/page.tsx` | Print view | existing token lookup |

Two deliberate choices:

- The **guard-free core** mirrors `lib/crm/invoices.ts`, which exists so an unauthenticated
  context can compose it.
- The block editor gets **its own component** rather than growing
  `ProposalEditorClient.tsx`, which is already 630 lines.

**Repo footgun:** types stay in `lib/types.ts` and are imported by the actions. Re-exporting
a type from a `'use server'` module passes `tsc` and breaks `next build`.

## Public renderer

`ProposalDocument.tsx` is a **server component with no client JS**. Block types map to
semantic HTML:

| Block | Element |
|---|---|
| `heading` | `<h2>` / `<h3>` per `level` |
| `paragraph` | `<p>` with markdown-subset spans |
| `list` | `<ul>` / `<ol>` |
| `testimonial` | `<blockquote>` + `<cite>` |
| `image` | plain `<img loading="lazy">`, `max-width: 100%` |

**Plain `<img>` is deliberate.** `next.config.ts` has no `images.remotePatterns`, and ops
evidence photos are rendered as a *"view photo"* link rather than an image — there is no
precedent in this app for rendering a remote image. Using `next/image` would couple
`next.config.ts` to the storage bucket domain, and the print view wants unoptimized images
regardless. If image weight becomes a problem later this is a contained swap.

`alt` is part of the generation schema, so generated images arrive with alt text.

## Admin editor

`ProposalBlockEditor.tsx`, client component:

- Block list with inline editing; five-way type picker to add
- **Reorder via up/down buttons, not drag-and-drop.** No DnD library exists in the repo, and
  adding one buys a dependency plus touch and keyboard-accessibility work. Buttons are
  keyboard-accessible for free and work on a phone — which matters, because the operator
  running the cart is the one editing.
- Delete with confirmation
- Image blocks: file input → `uploadProposalImage` → URL into the block
- Blocks live in editor state; nothing persists until **Save** calls `updateProposalBlocks`

## Print route

`app/(public)/proposals/[token]/print/page.tsx`, mirroring
`app/(admin)/[orgSlug]/[eventSlug]/ops/print/page.tsx`:

- Server component, `export const dynamic = 'force-dynamic'`
- **The same token lookup as the main public page** — no extra data, no weaker check
- Renders document + pricing summary
- `PrintButton` (existing component pattern) calling `window.print()`, `print:hidden` on chrome
- A **Download PDF** link on the main proposal page points here

A server-rendered, archived PDF stored at signing time is a deliberate follow-up, not part
of this increment. It requires Chromium on a Function plus provisioned Storage.

---

# Increment 2 — AI drafting

## Shape

`generateProposalDraft(orgId, proposalId, notes)` — a **read-only server action**. It reads
the org catalog and the proposal itself (for `lead_id` and the customer/event context
already attached to it), calls the model, and returns blocks. It **writes nothing**. The
draft lands in the editor as unsaved state; nothing persists until the admin saves.

Guarded with `assertOrgAdmin` like the other proposal actions — read-only does not mean
unauthenticated.

This removes a class of risk (no half-written proposals, no clobbering concurrent edits) and
means the action needs no guard-free core.

## Grounding

The line the model may not cross, from the analysis:

> AI should assist with clarity. It should not silently invent pricing, legal terms or scope.

Two mechanisms enforce it:

1. **The org's catalog goes in the prompt** — `listWorkPackagesCore(orgId)` and
   `listResourcesCore(orgId)`, both already guard-free.
2. **The model returns `suggested_package_ids`, never prices.** Any id not present in the
   org's catalog is dropped server-side, and every price is read from the catalog after
   generation.

The analysis warned against "an AI proposal generator that works without structured business
data." Ops-core supplies exactly that data, which is what makes this buildable now.

## Structured output

Raw JSON Schema in `output_config.format` — `additionalProperties: false`, `required` on
every object, `anyOf` for the block union. The repo has **no zod/ajv/yup**; validation is
hand-written guards, so `zodOutputFormat` is not available and would mean a new dependency.

Response shape:

```jsonc
{
  "blocks": [ /* the ProposalBlock union */ ],
  "suggested_package_ids": ["..."],
  "rationale": "one paragraph, shown to the admin, not to the customer"
}
```

Our own guards re-validate the parsed object. This is **required**, not defensive
duplication: structured outputs do not support `minLength` / `maxLength` / array-length
constraints, so the schema cannot express the caps from increment 1. `normalizeBlocks` is
the only enforcement point.

## Model configuration

| Setting | Value | Rationale |
|---|---|---|
| Model | `claude-opus-5` | Repo default |
| Thinking | omitted — adaptive is on by default on Opus 5 | Drafting benefits from it |
| `max_tokens` | 16000 | Caps thinking **and** output together |
| Effort | `high` | Sweep `medium` later; low/medium are strong on this model |
| Transport | `.stream()` → `.finalMessage()` | Timeout safety on a long generation, with a plain single-value return — no SSE plumbing, no streaming UI in v1 |
| Caching | `cache_control` on system + catalog blocks; notes last | Every generation for an org shares that prefix; Opus 5's minimum cacheable prefix is 512 tokens |
| Fallbacks | `fallbacks: "default"`, beta `server-side-fallback-2026-07-01` | Opus 5's classifiers can decline a request; a refusal is HTTP 200, not an error |

SDK: the official `@anthropic-ai/sdk`. Not routed through Vercel AI Gateway — there is no
gateway configuration in this project today, and direct use keeps the full structured-output
surface with no extra layer. Revisit if multi-provider fallback or centralized observability
becomes a requirement.

## Input

Pasted free text: call notes, a forwarded email, a transcript. Plus the existing
lead/opportunity context on the proposal (`lead_id`).

Voice-memo transcription is out of scope — it needs a transcription service. Pasting a
transcript produced elsewhere works today.

## Editor integration

The AI panel sits inside the block editor: a textarea for notes → **Generate draft** → the
returned blocks render as a **preview** before anything is applied.

- Proposal has **no** blocks → **Use draft** fills the editor
- Proposal **already has** blocks → **Append** (default) or **Replace**, Replace confirming first

Append is the default because the destructive option should never be the reflex action, and
the generator is exactly the button someone taps twice.

## Error handling

`stop_reason` is checked **before** reading content:

| Condition | Behavior |
|---|---|
| `stop_reason === 'refusal'` | Clear message; do not retry the same prompt |
| `stop_reason === 'max_tokens'` | "Draft too long — shorten your notes." Truncated JSON is unparseable. |
| `RateLimitError` / `APIError` | Typed SDK exceptions surfaced, not swallowed |
| Guard failure (unknown package id, cap exceeded) | **Normalize, don't fail** — drop, truncate, and report what was adjusted |

Normalizing rather than failing matters: a single bad package id should not throw away an
otherwise good draft, but the admin must be told what changed rather than silently receiving
less than the model wrote.

## Configuration and observability

- `ANTHROPIC_API_KEY` — server-only, added to `.env.example`, **never** `NEXT_PUBLIC`
- Per-generation logging of `input_tokens`, `output_tokens`, `cache_read_input_tokens`.
  There is no gateway, so app-level logging is the only observability.
- The **Generate draft** button does not render when `ANTHROPIC_API_KEY` is unset, so local
  development without a key still works. `ANTHROPIC_API_KEY` is server-only and a client
  component cannot read it — the **server page computes `aiEnabled = !!process.env.ANTHROPIC_API_KEY`
  and passes it as a prop** to `ProposalBlockEditor`. Do not reach for `process.env` inside the
  client component, and do not rename the variable to `NEXT_PUBLIC_*` to make it readable —
  that would inline the key's presence into the client bundle.

---

# Cross-cutting

## Testing

| Target | Approach |
|---|---|
| `lib/proposals/blocks.ts` | Real unit tests — caps enforced, unknown types dropped, markdown emphasis works, HTML never survives |
| Generation | Anthropic client **mocked** (as the suite mocks `adminBucket`) — unknown package ids dropped, caps hold, `refusal` and `max_tokens` handled. **No live API calls in the suite.** |
| Components | RTL, matching existing test style |
| Actions | Admin SDK mocked, per repo convention |

**Green gate — three commands:**

```
npx tsc --noEmit
npx vitest run --exclude '**/.claude/**'
npm run build
```

`npm run build` is non-negotiable: a `'use server'` type re-export passes `tsc` and breaks
the build, and it has bitten this repo twice. Tests run **inside this worktree**, never the
primary checkout, which scans nested worktrees and produces thousands of phantom failures.

## Rollout

No migration and no backfill. `blocks?` is optional, so existing proposals render exactly as
they do today with no document section.

Image uploads will fail in production until Storage is provisioned; the action surfaces a
clear error rather than a stack trace, and the dependency is already on the BrewTrax launch
checklist.

## Included adjacent fix

`expires_at` is editable in the builder and **displayed to the customer**
("This proposal expires {date}",
[`ProposalResponseClient.tsx:449`](../../../components/proposals/ProposalResponseClient.tsx))
but is never enforced — [`lib/types.ts:466`](../../../lib/types.ts) says `display-only this
increment`. A customer can accept an expired proposal and it books.

This is a two-line guard in a file this increment already rewrites. Included here; strike it
if it should stay separate.

## Out of scope

- Versioning, proposal history, and lock (governance — increment 4+)
- Cost and margin visibility (explicitly declined)
- Customer comments and change requests
- Sending follow-ups automatically (increment 4 drafts them only)
- Server-rendered PDF archived at signing time (deferred; needs Chromium + Storage)
- Voice-memo transcription
- Built-in per-pack template content (obsoleted by AI drafting)
- Per-section view tracking

## Known limitation to carry forward

`proposal.events[]` records `viewed` but not *what* was viewed. The analysis's follow-up
example — "Sarah reviewed the lighting and payment sections twice" — is **not achievable**
on current data. Increment 4 can draft from "opened three times, no package selected," which
is still useful; per-section engagement would require new tracking. Recorded here so the
feature is not oversold when it lands.
