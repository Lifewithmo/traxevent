# CRM Pre-Deploy Migration & Backfill — Design

**Date:** 2026-08-05
**Status:** approved in brainstorming; feeds the CRM pre-deploy migration implementation plan.

## Context

CRM V1 Increment 1 (merged to `main`) built the data foundation — first-class `Customer`, `Task`, `Note`, `ActivityEvent`, and the V1 lead stages `inquiry | consultation | proposal | closed_won | closed_lost` — and deliberately deferred a cluster of data-migration debts to a pre-deploy pass. This is that pass.

**Deployment reality:** pre-launch. No production org holds live data yet. The goal is therefore **correct, safe, runnable tooling** — idempotent, with a dry-run — that is ready to run at launch or against seed/staging data. The backfills are effectively no-ops today but must be trustworthy when there is data.

## Debts being closed

1. **Script-safe write path** — the migration runner can't execute. It reuses server actions whose guards (`assertOrgAdmin` → `getCurrentUser` → `next/headers` `cookies()`) require a Next.js request scope, so a plain `npx tsx` run throws `"cookies was called outside a request scope"`. (It fails safe — before any write — but it cannot run.)
2. **Customer backfill** — create a `Customer` from each existing lead's contact fields and link the lead via `customer_id`. Logic exists (`scripts/crm-migrate-customers.ts` `migrate()`) but is blocked by debt #1.
3. **Legacy stage backfill** — the stage rename was code-only. Any lead stored at a dropped stage (`booked` / `delivered`) is stranded: `groupLeadsByStage` drops it from the board and `computeHealth` misclassifies `booked` as an open `needs_attention`. Backfill rewrites these to the V1 stage set.

**Explicitly out of scope (confirmed non-task):** re-pointing `lead_id` on Proposals / Invoices / Contracts / Vendors. Increment 1 kept the `leads` collection name and never changed lead ids, so those references already point at the correct documents. The design's original "reshape + reseed" mention of re-pointing assumed a collection/id rename that did not happen.

## First principle: authorization is an edge concern, not a data concern

`assertOrgMember` / `assertOrgAdmin` answer *"is this web request's logged-in user allowed to act on this org?"* They gate **untrusted, request-driven callers** (browsers). A migration script run with the Firebase **admin service account** is a different trust context: it already has full, unmediated Firestore access via its credentials — there is no untrusted caller to gate. Requiring a user session inside a script is a category error.

Each action today fuses two separable concerns:
- **Authorization boundary** — `assert*` + cookie read — meaningful only at the request edge.
- **Data logic** — id scheme (`randomBytes(8)`), field cleaning/trimming, ISO timestamps, activity logging — invariant everywhere.

Scripts want the data logic, never the authorization. So we split them.

## Approach: extract guard-free data cores

Move the Firestore read/write logic into plain modules under `lib/crm/*` (no `'use server'`, no `assert*`). The existing `actions/*.ts` become thin wrappers — `assert*`, then delegate to the core. Scripts import the cores directly.

- **`lib/crm/customers.ts`** — `createCustomerCore(orgId, input)`.
- **`lib/crm/leads.ts`** — `listLeadsCore(orgId)`, `updateLeadCore(orgId, leadId, updates)` (covers both `customer_id` linking and stage rewrite).
- `actions/customers.ts` `createCustomer` = `assertOrgAdmin` → `createCustomerCore`.
- `actions/leads.ts` `listLeads` = `assertOrgMember` → `listLeadsCore`; `updateLead` = `assertOrgAdmin` → `updateLeadCore` (delegating; the existing stage-change activity logging stays in the action layer, since it is caller-facing behavior — see Constraints).

**Scope discipline (YAGNI):** extract only the functions the scripts touch — customer-create, lead list/update. Do **not** refactor every action. This is the minimal split that removes the coupling; it is also the layering the codebase will want the first time anything else runs off-request (cron, webhooks).

**Rejected alternatives:**
- **`runAsSystem()` (AsyncLocalStorage bypass):** keeps authz and data fused and pokes a hole in the security-critical guard layer; the script masquerades as a user. Adds risk to the most sensitive code to avoid refactoring the least sensitive code.
- **Direct `adminDb` in scripts:** drops authz correctly but re-implements the write logic (id/timestamp/cleaning), which drifts from the real actions — the exact divergence the Increment-1 review flagged.

### `import 'server-only'` note

`lib/crm/*` must be importable by plain scripts, so the cores do **not** carry `import 'server-only'`. They are a server data layer: imported only by `actions/*` and by scripts, never by client components. The `actions/*` wrappers remain the request-edge boundary. (This is the same "callers at the edge go through actions" discipline the codebase already relies on.)

## The scripts

### Customer backfill (`scripts/crm-migrate-customers.ts`, updated)
`migrate(orgId)` switches from the server actions to the `lib/crm/*` cores, unblocking it. Behavior is otherwise unchanged and already idempotent: leads with a `customer_id` are skipped; dedup is by normalized email within the run.

### Legacy stage backfill (`scripts/crm-backfill-stages.ts`, new)
- A pure `mapLegacyStage(stage): LeadStage | null` — `booked → closed_won`, `delivered → closed_won`, anything else → `null` (no change). Both legacy stages were post-booking outcomes = won; neither is a loss.
- A `backfillStages(orgId)` runner: list leads via the core, and for each lead whose stage maps non-null, `updateLeadCore(orgId, id, { stage: mapped })`. Idempotent — re-running touches nothing because V1 stages never map.
- Because it writes through the **core** (not the `updateLead` action), the backfill intentionally emits **no** `stage` `ActivityEvent`. A one-time bulk data migration should not flood every opportunity's activity timeline with synthetic "Stage → closed_won" entries. This is a deliberate consequence of keeping activity logging in the action wrapper.

### Shared run harness
Both scripts share a small runnable entrypoint pattern:
- **Dry-run:** a `--dry-run` flag reports what *would* change (counts + per-lead before→after) and performs **zero** writes.
- **Idempotency:** re-running after a completed run is a no-op.
- **Runnable under ESM:** replace the dead `require.main === module` guard (broken under ESM/tsx) with a working entrypoint check, exposed via npm scripts:
  - `npm run crm:migrate -- <orgId> [--dry-run]`
  - `npm run crm:backfill-stages -- <orgId> [--dry-run]`
- Add the TypeScript script runner (`tsx`) as a devDependency if not already present.

## Testing

Unit tests with mocked `firebase-admin`, matching the Increment-1 style (`vi.hoisted` spies):
- `lib/crm/customers.ts`, `lib/crm/leads.ts` cores — write shape (id, timestamps, cleaned fields), and that they perform no auth.
- `actions/*` wrappers — still assert then delegate (existing action tests must keep passing unchanged).
- `mapLegacyStage` — the mapping table + the null (no-change) cases, including idempotency (V1 stages map to null).
- `migrate` dedup/idempotency already covered by the pure mapping test; extend only as needed.

The backfill **runners** are manual scripts, not exercised in CI. Only pure/mapping logic and the cores are unit-tested.

## Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before any server-action changes; heed deprecation notices (per AGENTS.md).
- **No behavior change to the request path.** The `actions/*` wrappers must preserve their current signatures, validation, and side effects exactly — including `updateLead`'s stage-change `ActivityEvent` logging and `setLeadStage`. Extraction is a pure refactor at the edge; existing action tests pass unchanged.
- **Green gate:** `npx tsc --noEmit` clean AND `npm test` passing at every step (run `npm install` first if ~5 `server-only` load failures appear — a node_modules sync quirk).
- **Branch:** work on `claude/crm-predeploy-migration` (off `main`). Do not commit to `main`. Do not touch other worktrees/branches.
- **Do not run the migration against any real environment as part of this work.** Deliver runnable, dry-run-capable tooling; running it is an operator step.

## Deliverables

- `lib/crm/customers.ts`, `lib/crm/leads.ts` (+ tests) — guard-free cores.
- `actions/customers.ts`, `actions/leads.ts` — thin wrappers delegating to cores.
- `scripts/crm-migrate-customers.ts` — updated to use cores; dry-run; working entrypoint.
- `scripts/crm-backfill-stages.ts` (+ mapping test) — new legacy-stage backfill.
- `package.json` — `crm:migrate` / `crm:backfill-stages` npm scripts; `tsx` devDependency if missing.
- Green suite throughout.
