# D4 — Neutralize Church-Framing Display Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Single task — one implementer + one review.

**Goal:** Remove the hardcoded church/camp framing from the global, user-facing display copy so the product reads as a generic event-business platform.

**Architecture:** Copy-only changes to a handful of hardcoded strings (metadata, marketing, placeholders, error strings). No schema, no behavior, no code-identifier renames, no per-event terminology (D5's job).

**Tech Stack:** Next.js 16, TypeScript, Vitest.

## Global Constraints (Scope A — bounded)

- **Display strings only.** Do NOT rename code entities (`RegistrantProfile`, `listMembers`, etc.), and do NOT change per-event terminology (`Campers`/member labels stay — D5 replaces the event-types that carry them).
- **Leave "Organization" labels** as-is (already neutral SaaS wording; and CRM "Organization" fields mean the *client's* company — must not become "Business").
- **Leave test-fixture org names** (`First Hills Fellowship`, `Riverside Youth Ministry` as sample data) — they're harmless test data, not display copy.
- Green gate: `npx tsc --noEmit` clean AND `npm test` passes (450 tests; update the one test that asserts a changed string).
- Work only in `/Users/rm/vw/traxevent/.claude/worktrees/d4-neutralize-nouns` on branch `claude/d4-neutralize-nouns`; confirm the branch before committing.

---

### Task 1: Neutralize the church-framing display copy

**Exact changes (make these, nothing broader):**

| File:line | From | To (suggested — keep neutral, no church) |
|---|---|---|
| `app/layout.tsx:10` | `description: 'Camp registration and management platform'` | `description: 'Event registration and management platform'` |
| `app/(marketing)/page.tsx:9` | `Camp registration and management for churches and ministries.` | `Registration and management for the events you run.` |
| `app/(auth)/onboarding/page.tsx:53` | `E.g. "First Hills Fellowship" or "Riverside Youth Ministry"` | `E.g. "Riverside Catering" or "Summit Event Co."` |
| `app/(auth)/onboarding/page.tsx:59` | placeholder `"Your church or organization"` | `"Your business or organization"` |
| `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx:276` | placeholder `` `${event.name} at Your Church` `` | `` `${event.name} at Your Business` `` |
| `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx:290` | placeholder `"director@yourchurch.org"` | `"you@yourbusiness.com"` |
| `components/admin/EmailDomainClient.tsx:125` | placeholder `"mail.yourchurch.org"` | `"mail.yourbusiness.com"` |
| `components/admin/EmailDomainClient.tsx:128` | `...like mail.yourchurch.org dedicated...` | `...like mail.yourbusiness.com dedicated...` |
| `components/admin/DepartmentsClient.tsx:70` | `(e.g. by ministry or program)` | `(e.g. by team or program)` |
| `app/(registrant)/[orgSlug]/[eventSlug]/edit/page.tsx:34` | `setError('Camp not found')` | `setError('Event not found')` |
| `app/api/payments/intent/route.ts:30` | `error: 'Camp not found'` | `error: 'Event not found'` |
| `actions/events.ts` (the `updateEvent` "Camp not found" throw) | `throw new Error('Camp not found')` (or similar) | `throw new Error('Event not found')` |
| `app/(admin)/[orgSlug]/new-event/page.tsx:93` | placeholder `"Summer Camp 2026"` | `"Summer Gala 2026"` |
| `__tests__/actions/events.test.ts:103,105` | asserts `'Camp not found'` | update to `'Event not found'` (and the test title) |

- [ ] **Step 1: Locate the `actions/events.ts` "Camp not found" string**

Run: `grep -n "Camp not found" actions/events.ts` — confirm the exact line/wording before editing.

- [ ] **Step 2: Apply every change in the table above**

Make each edit exactly. Do not touch any string not listed (in particular, leave `Campers`, `Organization`, and test-fixture org names).

- [ ] **Step 3: Update the affected test**

In `__tests__/actions/events.test.ts`, change the `'Camp not found'` assertion (and the `it(...)` title) to `'Event not found'`.

- [ ] **Step 4: Verify no church-framing display copy remains**

Run: `grep -rniE "church|ministr|congregation|denomination" --include='*.tsx' --include='*.ts' app components | grep -v node_modules | grep -viE "^[^:]*:[0-9]*: *//|import|from '"`
Expected: no user-facing church copy (a leftover comment is fine; a visible string is not). Report anything remaining.
Run: `grep -rn "Camp not found" --include='*.ts' --include='*.tsx' . | grep -v node_modules` → expected: zero.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (450 pass, no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(d4): neutralize church-framing display copy (metadata, marketing, placeholders, errors)"
```

## Self-Review

**Spec coverage:** the bounded scope-A set (metadata/title, marketing, church placeholders, "Camp not found" errors, "Summer Camp" placeholder) → Task 1 ✅. Per-event terminology + Organization relabel deliberately out of scope (D5 / neutral-already).
**Placeholder scan:** every change is an exact string with file:line. **Consistency:** the `'Camp not found'` string is changed in all three places (edit page, payments route, actions/events.ts) and its test, so no assertion drifts.
