# "Generate from Proposal" UI Wiring — Design

**Date:** 2026-08-05
**Branch:** `claude/traxevent-invoicing-system-4c451a` (level with main @ c68aefb).

## Problem

`generateFromProposal` (itemized draft from an accepted proposal — deposit/progress/final/quick, tested, on main) has **no UI entry point**. Today the only way to create an invoice in the UI is the "New invoice" button, which makes a **blank** draft for manual entry. This wires the source-driven path into the lead/opportunity invoices section.

## Design

**Page** (`app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`) — already loads `proposals`; no new query. Compute `acceptedProposals = proposals.filter(p => p.status === 'accepted').map(p => ({ id: p.id, title: p.title }))` and pass it to `LeadInvoicesClient`.

**`LeadInvoicesClient`** gains `acceptedProposals: { id: string; title?: string }[]`:
- Keep "New invoice" (blank/manual) unchanged.
- Render a **"Generate from proposal"** button next to it ONLY when `acceptedProposals.length > 0`.
- Clicking it toggles an inline panel:
  - **proposal `<select>`** — shown only when `acceptedProposals.length > 1`; defaults to the first. Options labeled `title || 'Proposal'`.
  - **type `<select>`** — Deposit / Progress / Final / Quick (values `deposit|progress|final|quick`), labels from `INVOICE_TYPE_LABELS`; defaults to `deposit`.
  - **Generate** + **Cancel** buttons.
- **Generate** → `generateFromProposal(orgId, leadId, selectedProposalId, { type })` → on success `router.push('/${orgSlug}/leads/${leadId}/invoices/${created.id}')` (same landing as "New invoice"). On error, show it inline via the existing `error` state (e.g. "exceeds approved scope"); re-enable the button.
- All four types offered every time (no state-based filtering — the scope guardrail governs).

## Scope
**In:** the page prop + the component control + tests. **Out:** changing `generateFromProposal` logic; other source types; the editor.

## Testing (green gate: `tsc --noEmit` + `vitest run`)
1. "Generate from proposal" renders when `acceptedProposals` is non-empty; absent when empty.
2. The proposal `<select>` appears only when there is more than one accepted proposal.
3. Choosing a type + clicking Generate calls `generateFromProposal(orgId, leadId, proposalId, { type })` with the selected values and navigates to the returned draft.
4. A thrown error surfaces inline (button re-enabled).
