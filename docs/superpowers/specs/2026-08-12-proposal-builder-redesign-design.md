# Proposal Builder Redesign — Design

**Date:** 2026-08-12
**Status:** Approved (pending spec review)
**Replaces:** the right-rail layout of the proposal builder (`components/admin/proposal-builder/RightRail.tsx` and its seams in `ProposalBuilderClient.tsx` / `TopBar.tsx`).

## Problem

The proposal builder's right rail is a flat stack of unrelated things — errors/save state, completeness, send/void/delete, the client link, pricing terms (discount, tax, deposit, gate, refund policy), expiry, client notes, and the AI panel. User verdict: not intuitive to anyone. Specific failures, all confirmed:

1. **No grouping or hierarchy** — actions, settings, and status blur together.
2. **Wrong things live there** — discount/tax/deposit/notes are client-visible document content, edited far from where they render.
3. **The send flow is buried** — the page's primary action is a small button mid-rail beside Delete, and the client link is exposed on unsent drafts.
4. **Too much at once** — power settings (deposit gate, refund policy, expiry) are always visible.
5. **AI reads as an afterthought** — the drafting panel (the primary creation path) is docked at the bottom of a sidebar.

## Design principle

Every control lives where its effect is visible. The rail is deleted. The page becomes two zones: a **command bar** (lifecycle + status) and a **canvas** (everything the client will see, edited in place). The AI is the front door for creating a proposal, not an accessory.

## 1. Command bar (TopBar grows up)

- Left: back link, inline-editable title, status badge — unchanged.
- Center-right: save state as quiet text (`Saved` / `Saving…` / `Retry now`), and an amber **placeholder chip** ("1 placeholder") that scrolls to the first placeholder block when clicked. "All sections complete" state renders nothing.
- Right, in order:
  - **✦ Draft with AI** — visible, labeled, permanent (when `aiEnabled` and unlocked). Never in the overflow.
  - **Primary button**: **Send to client…** while draft; **Copy client link** once sent.
  - **⋯ overflow menu**: Open print view, Desktop/Mobile viewport toggle, Void (sent, unsigned), Delete (draft).
- The client link is not shown anywhere while the proposal is a draft.
- Errors from send/void/delete and autosave adjustments surface as toasts, not rail text. `aria-live` announcements preserved.

## 2. Canvas: pricing terms edit where they render

The builder canvas gains an **editable Totals section** at the bottom of the document, mirroring the client-facing `ProposalTotals` rendering and reusing the PricingCanvas popover idiom:

- **Discount** and **Tax** render as rows in a totals block (Subtotal → Discount → Tax → Total), each row clickable to open a popover with type/value (discount) or rate (tax). When unset, a ghost "+ Add discount" / "+ Add tax" affordance appears (builder-only, never rendered to clients).
- **Deposit due** row: popover contains type/value, the gate as a plain radio pair ("Request deposit after acceptance" / "Require deposit before accepting"), and the cancellation/refund policy textarea. All deposit machinery lives behind the number it produces.
- **Expiry** renders as the client sees it ("This proposal expires …"), inline date-picker on click, "+ Add expiry" ghost when unset.
- **Notes for the client** becomes an editable note block near the totals with a placeholder when empty — it is client-visible content and belongs on the document.
- The sticky "Client sees: $X" bar is unchanged.
- All edits flow through the existing `update()` draft autosave path; `locked` renders everything read-only exactly as today.

## 3. Review & Send

Clicking **Send to client…** opens a right-side sheet (shadcn `Sheet`) replacing today's bare `window.confirm`:

- **Pre-flight checklist** (warnings, not blockers): placeholder sections remaining (with jump links), no expiry set, deposit configured or not.
- **Recipient**: the lead's contact name/email, so sending feels addressed.
- **Summary**: total (or range) the client will see; deposit due and when it's requested.
- **Send** confirms → on success the sheet flips to a success state showing the client link with Copy — the first moment the link is useful.
- After sending, the command bar's primary button becomes **Copy client link**.

Void keeps its reason prompt (moved into a small dialog); Delete keeps its confirm.

## 4. AI: the mainline creation path

### Seating
- **Empty/new proposals**: a hero card at the top of the document itself — "Draft this proposal from your notes" with a large notes textarea and Generate button, beside the existing skeleton-picker "start manually" path. Disappears once real content exists.
- **Placeholders**: every placeholder block gets an inline **Fill with AI** affordance; the command-bar placeholder chip offers **Fill remaining with AI**.
- **Always**: the ✦ Draft with AI command-bar button opens the same composer as a centered modal (notes in, streaming preview, Fill placeholders / confirm-gated Replace document — same semantics as today's `ProposalAiPanel` + `merge-draft`).

### Engine
- **Model: `claude-opus-5` at `output_config.effort: "medium"`** — restores the pre-2026-08-08 model; the latency that forced the Sonnet downgrade is addressed by streaming and lower effort instead. Restores `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) which Sonnet could not use. Cache minimum drops to 512 tokens.
- **Streaming into the canvas**: a streaming endpoint emits blocks as they complete; the composer/canvas renders them live (first content in ~2s). Fill/replace still applies atomically at the end through the existing merge path.
- **Prompt caching**: catalog + system prompt behind a `cache_control` breakpoint.
- **Bake-off step**: same three real drafts generated on Opus 5/medium and Sonnet 5/high under the new prompt, judged blind by the operator; the winner becomes the default. Model stays a single constant either way.

### Voice
- **Implicit few-shot**: when a proposal is sent, its final human-approved text blocks are captured as voice evidence. Draft prompts include the 2–3 most recent sent proposals as "write in the voice of these" examples. This learns from every edit the operator made — no feedback UI, no setup, compounds over time.
- **Optional explicit note**: one "How we sound" text field in Settings → Branding, blank by default, appended to the system prompt when present.
- Both live in the cached prefix.

### For the uninterested
No AI settings surface. One verb everywhere: "Draft from your notes" / "Fill with AI". Voice learning is invisible. The manual path (skeletons, hand-written blocks) is untouched.

## Component impact

| Component | Change |
|---|---|
| `RightRail.tsx` | **Deleted.** |
| `TopBar.tsx` | Grows into the command bar (save state, placeholder chip, AI button, primary Send/Copy, overflow menu). |
| `ProposalBuilderClient.tsx` | Drops the rail; wires toasts, the send sheet, and streaming AI state. |
| `PricingCanvas.tsx` (or sibling `TotalsCanvas`) | Gains the editable totals section + notes block. |
| `ProposalAiPanel.tsx` | Reworked into the hero card / modal composer with streaming. |
| `actions/proposal-ai.ts`, `lib/ai/client.ts` | Opus 5 + effort medium + fallbacks; streaming route; voice few-shot assembly; cache breakpoints. |
| New: sent-proposal voice capture | On `sendProposal`, snapshot final text blocks into an org-scoped `voice_examples` store (cap ~3, newest wins). |
| Settings → Branding | Optional "How we sound" field. |
| Tests | `builder-rail`-targeted tests rewritten against command bar / totals section / send sheet. |

## Error handling

- Send/void/delete failures: toast anchored to the sheet/menu, busy states as today.
- AI stream failure mid-generation: composer shows the error with retry; nothing is applied to the document (apply remains atomic).
- Refusals: existing `parseDraftResponse` messages; Opus restores server-side fallback so most refusals self-heal.

## Testing

- Unit: totals-row popovers write correct draft patches; deposit popover clears gate/terms when deposit removed (existing invariant); voice-example capture on send; prompt assembly includes voice blocks.
- Component: command bar states (draft/sent/locked/voided); send sheet pre-flight derivations; placeholder chip scroll/fill actions.
- `next build` before calling the branch green (per repo rule).

## Out of scope (YAGNI)

- Any change to the public client-facing proposal pages or print view.
- Editing the AI's suggested packages inside the composer (apply-then-edit on canvas, as today).
- Distilled/summarized voice profiles ("style memos") — few-shot only for v1.
- Email-sending of proposals (link-based flow unchanged).
