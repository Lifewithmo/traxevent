# D1 — Cut the Network/Denomination Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the church-specific network/denomination tier from the codebase entirely, leaving a clean org + event product.

**Architecture:** Pure deletion, ordered to keep the build green at every step — delete the leaf routes/UI first, then the actions/lib they call, then the auth and billing hooks, and finally the shared type definitions once nothing references them. No new behavior; each task is verified by `tsc --noEmit` staying clean and the full Vitest suite passing with the network tests removed (not skipped).

**Tech Stack:** Next.js 16 App Router, TypeScript, Firestore (`firebase-admin`), Vitest.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before touching routing/layout behavior (`AGENTS.md`).
- **Pre-launch:** no data migration. Deleting collections' *code* is enough; no backfill.
- **Green at every task:** after each task, `npx tsc --noEmit` is clean AND `npm test` passes. The repo has 5 pre-existing `server-only` test-file load failures unrelated to this work — those may remain; there must be no *new* failures and all runnable tests pass.
- **Delete, don't skip, tests** for removed code. Removing a network test file is correct; leaving a `describe.skip` is not.
- **Do NOT touch** the client portal (`app/(public)/client/`, `components/client-portal/`, `actions/client-portal*.ts`) or `lib/portal.ts`'s generic `portalThemeVars` — those serve the Phase 5e client portal, not the network tier.
- Work only in the worktree at `/Users/rm/vw/traxevent/.claude/worktrees/neutralization` on branch `claude/eventtrax-neutralization`. Before every commit, confirm `git rev-parse --abbrev-ref HEAD` prints `claude/eventtrax-neutralization`; if it prints anything else, STOP.

---

### Task 1: Delete the network routes, API, and UI

**Files:**
- Delete (dirs): `app/(network)/`, `app/(auth)/network-onboarding/`, `app/(public)/portal/`, `app/api/billing/network-checkout/`, `app/api/billing/network-portal/`, `components/network/`
- Delete (file): `components/portal/NetworkPortalView.tsx`
- Modify: none expected (these are leaves). If `components/portal/` becomes empty after the delete, remove the empty dir.

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: removes all callers of `requireNetworkMember`/`requireNetworkAdmin` (Task 3), the network actions (Task 2), and the network billing API. After this task, no route references the network tier.

- [ ] **Step 1: Delete the route/UI/API surface**

```bash
cd /Users/rm/vw/traxevent/.claude/worktrees/neutralization
git rm -r "app/(network)" "app/(auth)/network-onboarding" "app/(public)/portal" \
         "app/api/billing/network-checkout" "app/api/billing/network-portal" \
         "components/network" "components/portal/NetworkPortalView.tsx"
```

- [ ] **Step 2: Verify nothing else imported the deleted UI**

Run: `grep -rn "NetworkPortalView\|(network)\|network-onboarding\|network-checkout\|network-portal" app components --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: no matches outside files already deleted. (`app/api/billing/webhook` and `actions/network-portal` still reference network internally — those are handled in Tasks 4 and 2; this grep is scoped to `app`/`components` UI imports.) If an unexpected UI import remains, remove that import.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (The network *actions*/*types* still exist, so nothing the deleted pages needed is missing yet.)

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: passes with no new failures.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: remove network tier routes, API, and UI"
```

---

### Task 2: Delete the network actions, lib, and reporting

**Files:**
- Delete: `actions/networks.ts`, `actions/network-billing.ts`, `actions/network-portal.ts`, `actions/network-templates.ts`, `lib/network-billing.ts`, `lib/network-scope.ts`
- Delete (tests): `__tests__/actions/networks.test.ts`, `__tests__/actions/network-billing.test.ts`, `__tests__/actions/network-portal.test.ts`, `__tests__/actions/network-templates.test.ts`, `__tests__/actions/network-report.test.ts`
- Modify: `actions/reports.ts` — remove `getNetworkReportData` (lines ~172-193), the `assertNetworkMember` name from the `@/lib/auth/assert` import (line 4), the `scopeOrgsToMember` import (line 5), and `aggregateNetworkReport, NetworkReport, NetworkOrgReport` from the `@/lib/reports` import (lines ~17-19)
- Modify: `lib/reports.ts` — remove `NetworkOrgReport` (line ~242), `NetworkReport` (lines ~248-249), and `aggregateNetworkReport` (line ~261 to end of function)
- Modify: `__tests__/lib/reports.test.ts` — remove any `aggregateNetworkReport`/`NetworkReport` cases (search the file); keep the org/event report tests

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: removes all callers of `lib/network-scope` and the network report helpers. After this task, `Network`/`Region`/`NetworkMember` are referenced only by the auth layer (Task 3) and `lib/types.ts` (Task 5).

- [ ] **Step 1: Delete the network actions, lib, and their tests**

```bash
cd /Users/rm/vw/traxevent/.claude/worktrees/neutralization
git rm actions/networks.ts actions/network-billing.ts actions/network-portal.ts actions/network-templates.ts \
       lib/network-billing.ts lib/network-scope.ts \
       __tests__/actions/networks.test.ts __tests__/actions/network-billing.test.ts \
       __tests__/actions/network-portal.test.ts __tests__/actions/network-templates.test.ts \
       __tests__/actions/network-report.test.ts
```

- [ ] **Step 2: Remove the network report from `actions/reports.ts`**

In `actions/reports.ts`: delete the `getNetworkReportData` function and its doc comment; drop `assertNetworkMember` from the `@/lib/auth/assert` import; delete the `import { scopeOrgsToMember } from '@/lib/network-scope'` line; drop `aggregateNetworkReport`, `NetworkReport`, `NetworkOrgReport` from the `@/lib/reports` import.

- [ ] **Step 3: Remove the network report helpers from `lib/reports.ts`**

In `lib/reports.ts`: delete the `NetworkOrgReport` interface, the `NetworkReport` interface, and the `aggregateNetworkReport` function.

- [ ] **Step 4: Remove network cases from `__tests__/lib/reports.test.ts`**

Run: `grep -n "aggregateNetworkReport\|NetworkReport\|NetworkOrgReport" __tests__/lib/reports.test.ts`
Delete the matching `describe`/`it` blocks (and any now-unused imports). Leave the org/event report tests intact.

- [ ] **Step 5: Confirm no stragglers**

Run: `grep -rn "network-scope\|aggregateNetworkReport\|getNetworkReportData\|network-billing\|network-portal\|network-templates\|actions/networks" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no matches.

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit` (expected clean), then `npm test` (expected: passes, no new failures).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove network actions, lib, and aggregated reporting"
```

---

### Task 3: Remove network authentication

**Files:**
- Modify: `lib/auth/guards.ts` — remove `requireNetworkMember` (lines ~33-47) and `requireNetworkAdmin` (~50-52); drop `Network, NetworkMember` from the `@/lib/types` import (line 7)
- Modify: `lib/auth/assert.ts` — remove `assertNetworkMember` (~31-42) and `assertNetworkAdmin` (~45-47); drop `NetworkMember` from the `@/lib/types` import (line 6)
- Modify: `lib/auth/session.ts` — remove `networkId`, `networkSlug`, `networkRole` from the session/user type (lines ~15-17) and the three `decoded.network*` assignments (~37-39)
- Modify: `actions/auth.ts` — remove `setNetworkClaims` (~21-27); drop `NetworkRole` from the `@/lib/types` import (line 4) — keep `OrgRole`
- Modify (tests): `__tests__/actions/auth.test.ts` (remove `setNetworkClaims` cases), `__tests__/lib/auth-assert.test.ts` (remove `assertNetworkMember`/`assertNetworkAdmin` cases), `__tests__/middleware.test.ts` (remove network-route cases if present)

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: removes the last consumers of `NetworkMember`/`NetworkRole` outside `lib/types.ts`. `user.networkId` no longer exists on the session type.

- [ ] **Step 1: Strip network auth from guards, assert, session, actions/auth**

Apply the removals listed in **Files** above. After editing, the only references to `Network`/`NetworkMember`/`NetworkRole` in the repo should be inside `lib/types.ts`.

- [ ] **Step 2: Remove network cases from the auth/middleware tests**

Run: `grep -rn "setNetworkClaims\|assertNetworkMember\|assertNetworkAdmin\|requireNetworkMember\|networkId\|networkSlug" __tests__/actions/auth.test.ts __tests__/lib/auth-assert.test.ts __tests__/middleware.test.ts`
Delete the matching cases and any now-unused imports/fixtures. Keep all org/camp auth tests.

- [ ] **Step 3: Confirm no stragglers outside types**

Run: `grep -rn "requireNetworkMember\|requireNetworkAdmin\|assertNetworkMember\|assertNetworkAdmin\|setNetworkClaims\|\.networkId\|networkSlug\|networkRole" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/types.ts"`
Expected: no matches.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit` (expected clean), then `npm test` (expected: passes, no new failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove network authentication (guards, asserts, claims, session)"
```

---

### Task 4: Remove network billing hooks

**Files:**
- Modify: `app/api/billing/webhook/route.ts` — remove `cascadeMemberOrgBilling` (~lines 25-40) and its calls (~40, 72), plus the surrounding network-subscription branch that drives `'network_managed'` cascades. Keep the org/business subscription webhook handling intact.
- Modify: `app/(admin)/[orgSlug]/billing/page.tsx` — remove the `'network_managed'` cases from the badge-variant and label logic (lines ~74, ~80, ~107)
- Modify (test): `__tests__/api/billing-webhook.test.ts` — remove the `network_managed`/cascade cases; keep the standard org checkout/subscription cases

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: removes the last runtime use of `billing_status === 'network_managed'` and `Org.network_id`, clearing the way for Task 5 to drop those from the type.

- [ ] **Step 1: Remove the network cascade from the billing webhook**

In `app/api/billing/webhook/route.ts`: delete `cascadeMemberOrgBilling` and the code path(s) that call it for network subscriptions. Verify the standard org subscription/`checkout.session.completed` handling is untouched.

- [ ] **Step 2: Remove `network_managed` from the billing page**

In `app/(admin)/[orgSlug]/billing/page.tsx`: remove the three `network_managed` references so the badge variant/label logic only handles `active | trialing | inactive`.

- [ ] **Step 3: Remove network cases from the webhook test**

Run: `grep -n "network_managed\|cascade\|network_id" __tests__/api/billing-webhook.test.ts`
Delete the matching cases; keep the standard billing cases.

- [ ] **Step 4: Confirm no stragglers**

Run: `grep -rn "network_managed\|cascadeMemberOrgBilling" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/types.ts"`
Expected: no matches.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (expected clean), then `npm test` (expected: passes, no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove network billing cascade and network_managed status handling"
```

---

### Task 5: Remove network types and Firestore rules

**Files:**
- Modify: `lib/types.ts` — remove interfaces `Network`, `Region`, `NetworkMember`, and type `NetworkRole`; remove `Org.network_id` and `Org.region_id` (lines ~22-23); change `Org.billing_status` (line 13) to `'active' | 'trialing' | 'inactive'` (drop `'network_managed'`); remove `FormTemplate.network_template_id`, `FormTemplate.network_id`, `FormTemplate.pushed_at` (lines ~281-283)
- Modify: `firestore.rules`, `firestore.indexes.json` — remove any `networks`/`regions` collection rules or indexes if present
- Modify (tests): any test still referencing the removed type fields (the prior tasks should have cleared these; this task confirms)

**Interfaces:**
- Consumes: the removals from Tasks 1-4 (no runtime code references these types anymore).
- Produces: `lib/types.ts` describes only the org + event product.

- [ ] **Step 1: Confirm every consumer is already gone**

Run: `grep -rn "\bNetwork\b\|\bNetworkMember\b\|\bNetworkRole\b\|\bRegion\b\|network_id\|region_id\|region_ids\|network_managed\|network_template_id" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/types.ts"`
Expected: no matches. If any remain, remove them before touching the type (they belong to whichever earlier task owns that file).

- [ ] **Step 2: Remove the network types from `lib/types.ts`**

Delete the `Network`, `Region`, `NetworkMember` interfaces and the `NetworkRole` type; remove `network_id`/`region_id` from `Org`; narrow `Org.billing_status` to `'active' | 'trialing' | 'inactive'`; remove the three network-provenance fields from `FormTemplate`.

- [ ] **Step 3: Remove network Firestore rules/indexes**

Run: `grep -n "networks\|regions" firestore.rules firestore.indexes.json`
Delete any `match /networks/...` blocks and any `networks`/`regions` composite indexes. (If there are none, no change — the tier used default rules.)

- [ ] **Step 4: Final typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npm test`
Expected: passes, no new failures. This is the D1 acceptance gate — a green build with zero network references.

- [ ] **Step 5: Confirm the tier is fully gone**

Run: `grep -rniE "network|denomination" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -vi "networkidle\|social network"`
Expected: no meaningful matches (only incidental words, if any). Report anything left.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove network/region types and Firestore rules — network tier fully cut"
```

---

## Self-Review

**Spec coverage** (against D1 in the neutralization design):
- Delete network actions/lib/components/routes/API → Tasks 1-2 ✅
- Remove `Network`/`Region`/`NetworkMember`/`NetworkRole` types + `Org.network_id`/`region_id` → Task 5 ✅
- Remove `billing_status: 'network_managed'` + network per-seat billing path → Tasks 4-5 ✅
- Remove `firestore.rules`/indexes for networks/regions → Task 5 ✅
- Remove `requireNetworkMember` and network auth → Task 3 ✅
- Remove network tests (deleted, not skipped) → Tasks 1-4 ✅
- Guard: org/event product builds and suite passes with network tests removed → every task's verify step ✅
- `FormTemplate` network-template provenance fields (from Phase 4b push-down) → Task 5 ✅ (added on discovery; part of the tier)

**Placeholder scan:** none — every step names exact files, symbols, and line ranges, with concrete grep/tsc/test commands. Deletion tasks specify what to remove rather than reproducing deleted code (correct for a deletion). ✅

**Type consistency:** the removal order is dependency-correct — callers (Tasks 1-4) before the type definitions they use (Task 5); each task's Step-1/2 grep confirms no straggling references before the next task assumes them gone. `billing_status` is narrowed once (Task 5) after its last consumer is removed (Task 4). ✅

**Note for the implementer:** line numbers are approximate (`~`) — locate by symbol name, which is exact. `lib/portal.ts` and the client portal are explicitly out of scope (Global Constraints).
