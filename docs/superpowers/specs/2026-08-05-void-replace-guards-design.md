# Void/Replace Lifecycle Guards — Design

**Date:** 2026-08-05
**Branch:** `claude/traxevent-invoicing-system-4c451a` (level with main @ 5b46ba0).

## Problem

`voidInvoice` and `replaceInvoice` act on an invoice in ANY lifecycle. This lets a caller void a `draft` (which should be deleted, not voided) or void/replace an already-terminal invoice (`voided`/`replaced`/`closed`), corrupting the financial state machine and muddying the `replaces_id`/`replaced_by_id` linkage. No financial fields are mutated, so it's a state-machine integrity gap, not a money bug — but it's the kind of invariant that must be airtight.

## Rule

Both operations are corrections to a **finalized (issued)** invoice, so both require `lifecycle === 'issued'`.

- **`voidInvoice`** — allowed only from `issued`.
  - `draft`/`approved` → throw `Only an issued invoice can be voided — delete the draft instead`.
  - `voided`/`replaced`/`closed` → throw `Invoice is already <lifecycle> and cannot be voided`.
- **`replaceInvoice`** — allowed only from `issued`.
  - any non-issued lifecycle → throw `Only an issued invoice can be replaced`.

The guard runs after reading + `normalizeInvoice`, before any write. `voidInvoice` currently doesn't normalize — add it to read `lifecycle`.

## Scope

**In:** the two guards + tests. **Out:** UI (the editor already surfaces Void/Replace only on issued invoices); any model change; `closed` transitions (still unused).

## Testing (green gate: `tsc --noEmit` + `vitest run`)
1. `voidInvoice` on an issued invoice succeeds (writes `lifecycle: 'voided'`, keeps number).
2. `voidInvoice` on a draft throws (`/delete the draft/i`), no write.
3. `voidInvoice` on an already-voided invoice throws (`/already/i`), no write.
4. `replaceInvoice` on an issued invoice succeeds (creates linked draft).
5. `replaceInvoice` on a draft throws (`/issued/i`), no create/update.
