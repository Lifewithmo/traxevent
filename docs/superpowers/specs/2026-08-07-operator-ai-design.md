# Operator AI — Assistive Drafting, Conversational Refinement, Read-Only Assistant (Design)

**Date:** 2026-08-07
**Status:** approved in brainstorming; feeds the implementation plans.
**Audience:** the operator (org admin) — the person living in the `(admin)` route group. Customer- and registrant-facing AI is explicitly out of scope.
**Builds on:** [`2026-08-06-proposal-presentation-design.md`](2026-08-06-proposal-presentation-design.md) increment 2 (AI drafting — approved, unbuilt), whose model configuration, structured-output, grounding, and error-handling decisions this design adopts wholesale; and ops-core, which supplies the structured business data every feature grounds in.

## Problem

TraxEvent has one approved AI feature on paper (proposal drafting) and no AI in the product.
The operator's day contains repeated blank-page moments (proposal documents, follow-up
emails, work-package ratios) and scattered-context questions ("what needs my attention?",
"am I missing anything for Saturday?") that today require reading several screens and
remembering several calls. The goal is AI that is **assistive** (drafts and suggestions
inside existing screens) and **interactive** (the operator can talk back — refine a draft,
ask follow-up questions) without ever becoming the author of record or a write path.

## Decisions fixed during brainstorming

1. **Audience: operator only.** No AI on public token pages, the client portal, or
   registrant surfaces in this design.
2. **Interactivity takes two forms:** per-artifact conversational refinement (increment 2)
   and a workspace-wide assistant (increment 3). Both were wanted; both are in.
3. **The assistant is read-only in v1.** It answers questions from org data and drafts text
   the operator sends themselves. No mutations, staged or otherwise. Writes are a later
   design once usage proves out.
4. **Sequencing is a ladder, not parallel tracks:** build the already-approved proposal
   drafting first, extract the shared core from it, then refinement, then the assistant.
   Each increment is shippable alone; each reuses the last.

## Placement rules (all features)

- AI output always lands as **editable preview** — the operator applies it; nothing the
  model produces persists without an operator save through the normal edited path.
- Every feature **degrades to absence**: no `ANTHROPIC_API_KEY` → the buttons don't render.
  The server page computes `aiEnabled = !!process.env.ANTHROPIC_API_KEY` and passes it as a
  prop (never `NEXT_PUBLIC_*`, never `process.env` in a client component).
- Grounding over generation: ids in, ids out. The model never authors a price, never names
  a Firestore collection, and every quantitative claim must cite its source.

## Workflow touchpoints

| Workflow moment | Surface | Increment |
|---|---|---|
| Writing a proposal document | **Generate draft** in the block editor (per approved spec) | 1 |
| Draft isn't right yet | Refinement input in the same panel | 2 |
| Quiet lead needs a follow-up | **Draft follow-up** on the lead/communicate surface | 2 |
| Building a work package | **Suggest quantities** in the package line editor | 2 |
| Sanity-checking an event | **Review notes** on the event ops screen | 2 |
| Cross-cutting questions | Read-only assistant, slide-over on all `(admin)` screens | 3 |

---

# Increment 1 — Proposal drafting (already specced)

Build [`2026-08-06-proposal-presentation-design.md`](2026-08-06-proposal-presentation-design.md)
increment 2 exactly as approved: `generateProposalDraft(orgId, proposalId, notes)`, read-only
server action, `assertOrgAdmin`, catalog-grounded, structured output re-validated by
`normalizeBlocks`, `claude-opus-5` / effort `high` / `max_tokens` 16000 /
`.stream().finalMessage()` / `fallbacks: "default"`, refusal and `max_tokens` handled before
content is read. That spec remains the authority for those details; this document does not
restate them.

**What this increment adds beyond that spec:** the shared core is extracted as it is built —
not designed speculatively:

- `lib/ai/client.ts` — the single `@anthropic-ai/sdk` instance, `import 'server-only'`,
  model/effort/token defaults, transport, fallbacks.
- `lib/ai/grounding.ts` — builders turning org data into cache-controlled prompt blocks:
  catalog (`listWorkPackagesCore` + `listResourcesCore`), org profile, per-feature context.
  System + catalog blocks carry `cache_control`; volatile input (notes, instructions) goes
  last. The ids-in/ids-out rule is implemented here once.
- `lib/ai/usage.ts` — per-call logging of `input_tokens`, `output_tokens`,
  `cache_read_input_tokens` with `org_id` and a feature tag, to `orgs/{orgId}/ai_usage`.
  This is the only observability (no gateway) and the future billing/plan-gating hook.
- Guards stay in `actions/`: every action calling `lib/ai/` asserts org membership first,
  like every other action. `lib/ai/` itself performs no auth (mirrors the guard-free core
  convention) and no writes except `ai_usage`.

No zod — structured-output schemas are raw JSON Schema; hand-written guards re-validate
everything the model returns, because the schema cannot express length caps.

---

# Increment 2 — Conversational refinement + three new assists

## Refinement loop

`generateProposalDraft` grows one parameter:

```ts
generateProposalDraft(orgId, proposalId, notes, turns?: RefinementTurn[])
// RefinementTurn = { instruction: string; draft: ProposalBlock[] }
```

Each turn sends: grounding (cached prefix) → original notes → prior draft as JSON → the
operator's instruction. The model returns the **same** structured shape as a first
generation: a full replacement draft, `suggested_package_ids`, rationale.

- **Server stateless.** Turn history lives in client component state and dies when the
  panel closes. No conversation collections, no persistence.
- **Full replacement, not diffs.** A model editing its complete prior output is more
  reliable than patch operations, and `normalizeBlocks` already validates complete arrays.
- **No trust discount for refinement.** Every turn's output passes the same caps and guards
  as a first draft.
- **8-turn client-side cap.** Past that, context degradation means regeneration beats
  refinement; the cap surfaces as "start a fresh draft."
- No streaming UI in v1 — each turn is one request with a loading state.

## Draft follow-up (quiet lead)

Same action shape and the same `RefinementTurn` type with `draft` as email text instead of
blocks. Grounded in the lead's stage, waiting state, notes trail, and proposal status.
Output is text handed to the existing communicate surface; the operator sends it. The AI
never sends email.

## Suggest quantities (work package editor)

The hard part of a `WorkPackageLine` is knowing the ratios (`qty_per_guest`, `base_qty`).
A **Suggest quantities** action takes the package name/description plus the org's resource
list and returns proposed lines:

```jsonc
{ "lines": [{ "resource_id": "...", "qty_per_guest": 0.0, "base_qty": 0.0, "rationale": "..." }], "notes": "..." }
```

- Only `resource_id`s that exist in the org survive the server-side filter; dropped ids are
  reported, not silently discarded.
- Units come from the resource's own `unit` field — the model does not invent units.
- Proposed lines land as editable preview in the line editor; `validateLines` runs on the
  operator's save exactly as today.
- Same refinement loop: "we serve doubles", "assume 4-hour outdoor July service" → revised
  ratios.
- **The derivation engine stays the authority.** [`lib/ops/derive.ts`](../../../lib/ops/derive.ts)
  computes pack lists from the saved lines; the AI only informs the inputs.

**Grounding upgrade — closeout actuals.** Once an org has events with `OpsActuals`
recorded, a grounding builder includes them: "last 3 events of this package averaged 1.6
oz/guest actual vs 2.0 planned." Generic hospitality heuristics for first-event orgs are
clearly labeled as estimates. Same builder pattern, new source.

## Review notes (event ops screen)

Notes attach to customers and opportunities, not events; events carry only
`OpsRequirements.notes` free text. By booking time the truth about a job is scattered
across the opportunity's notes trail, the accepted proposal, and the ops plan — nothing
reconciles them. **Review notes** gathers what is reachable from the event (linked
opportunity's notes, `OpsRequirements`, derived pack list and deadlines, accepted
proposal selection) and returns three structured lists rendered as cards:

1. **Summary** — a digest of the notes trail.
2. **Discrepancies** — notes-vs-plan conflicts, each citing its source note or field:
   "notes from Jul 30 say ~150 guests; requirements say 120."
3. **Suggested actions** — extracted commitments and loose ends as proposed task/deadline
   entries: "promised oat milk — not in the pack list."

Discrepancies link to the screen where the operator fixes them; suggested actions offer
one-click **prefill** of the existing task/requirements editors — the write still goes
through the normal operator save. Every claim must cite its source; the model reconciles,
it does not remember. The core function is action-callable in increment 2 and reused as an
assistant tool in increment 3.

---

# Increment 3 — Read-only workspace assistant

A slide-over panel in the `(admin)` layout, available on every admin screen, persistent
across navigation within a session. Conversation state in memory only; persistence is a
later call.

## Tool layer (the design center)

Hand-curated wrappers over reads that already exist and are already guarded. Launch set:

| Tool | Wraps |
|---|---|
| `pipeline_summary` | `lib/crm/leads.ts` — stages, counts, stale leads |
| `overdue_invoices` | `lib/crm/invoices.ts` + aging buckets in `lib/types.ts` |
| `upcoming_events` | events + `lib/ops/readiness.ts` |
| `event_detail` | one event's ops plan, checklist state, staffing gaps |
| `proposal_status` | outstanding proposals, viewed-but-unsigned, expiring soon |
| `customer_lookup` | `lib/crm/customers.ts` rollup |
| `quantity_check` | derived pack list + `OpsRequirements` → outlier flags with reasoning |
| `notes_review` | the increment-2 review-notes core |

Mechanics:

- `assistantTurn(orgId, messages)` — the tool-use loop runs server-side in one request,
  `max_iterations ≈ 6`, tools executed between model turns, final text returned.
- Every tool executes with the session's org claims. `orgId` comes from the authenticated
  session, **never** from model output; a tool taking an id validates it belongs to the org,
  exactly as `actions/` files do today. The model can name a tool, never a collection.
- Answers cite their data and the panel renders links into the real screens. The
  assistant routes the operator to the right page with context; it does not replace pages.

## Budget

A per-org daily token budget checked in `lib/ai/usage.ts` before each call, across all AI
features. Exceeded → soft-fail: "AI limit reached for today." A runaway conversation cannot
produce a surprise bill.

---

# Cross-cutting

## Error handling

Inherited from the approved drafting spec: `stop_reason === 'refusal'` → clear message, no
auto-retry with the same prompt; `stop_reason === 'max_tokens'` → "shorten your
notes/question"; typed SDK errors (`RateLimitError`, `APIError`) surfaced, not swallowed;
guard failures **normalize and report** — drop, truncate, and tell the operator what was
adjusted rather than discarding a good draft over one bad id.

## Testing

- Anthropic client **mocked everywhere** — no live API calls in the suite, matching how the
  suite mocks `adminBucket` and the admin SDK.
- Unit tests: grounding builders (catalog serialization, cache block placement, actuals
  inclusion), refinement-turn assembly, quantity-suggestion filtering (foreign resource ids
  dropped and reported), notes-review source citation shape, and each assistant tool
  wrapper (org isolation: a tool invoked with a foreign org id returns nothing).
- RTL for panel components, per existing test style.
- Green gate, per repo convention: `npx tsc --noEmit`, `npx vitest run --exclude
  '**/.claude/**'` (run inside the increment's worktree, never the primary checkout), and
  `npm run build` — a `'use server'` type re-export passes tsc and breaks the build; it has
  bitten this repo twice.

## Configuration

- `ANTHROPIC_API_KEY` — server-only, added to `.env.example`, never `NEXT_PUBLIC`.
- New Firestore collection: `orgs/{orgId}/ai_usage` (writes from `lib/ai/usage.ts` only).
- No migrations, no backfills anywhere — every feature is additive and optional.

## Rollout

Increments 1 → 2 → 3, each with its own implementation plan, worktree, and merge. 2 and 3
do not start until their predecessor is green. Increment 2's three assists (follow-up,
quantities, notes review) may land as separate PRs inside the increment if that keeps
reviews small.

## Out of scope

- Any AI on customer/registrant surfaces (public proposal pages, client portal,
  registration).
- Assistant writes — staged actions, task creation, stage changes. Later design, after
  read-only usage proves out.
- Conversation persistence and cross-session memory.
- Streaming UI (token-by-token rendering) — each request returns complete.
- Voice transcription; proactive/scheduled suggestions and notification surfaces.
- Vercel AI Gateway — direct `@anthropic-ai/sdk` per the drafting spec; revisit if
  multi-provider or centralized observability becomes a requirement.

## Known dependencies and risks

- **Increment 1's external dependency carries over:** proposal *image* blocks need Cloud
  Storage, which is unprovisioned on `traxevent-prod`. This blocks image uploads, not AI
  drafting.
- **Quantity suggestions are only as good as the resource catalog.** An org with three
  loosely named resources gets vague suggestions; the feature should degrade to honest
  hedging, and the actuals-grounding loop is the long-term fix.
- **`OpsActuals` sparsity:** the actuals grounding builder must handle zero-to-few events
  without pretending to a baseline it doesn't have.
- **Token spend concentration:** the assistant's tool loop can multiply calls; the daily
  budget plus `max_iterations` bound it, and `ai_usage` makes spend visible per org from
  day one.
