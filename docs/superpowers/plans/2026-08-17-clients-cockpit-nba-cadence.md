# Clients Cockpit — Next-Best-Action + Re-Book Cadence Implementation Plan

> **For agentic workers:** implement task-by-task. Each task ends with an independently testable deliverable. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the "computes the insight, stops one move short of the action" gap the design-ambition panel found — give the Clients cockpit a computed, ranked, **draft-seeded** Next-Best-Action, cadence-relative dormancy, a working note composer, and fix two confirmed trust bugs. Move the surface from *Good* toward *Great / category-defining* (a Re-Book Cadence Engine).

**Architecture:** Pure helpers in `lib/crm/*` (cadence, NBA ranking, overdue-invoice + reminder), thin `use server` actions (re-book proposal seed, contact-activity log), and UI wiring in the existing cockpit components. No schema migration — every primitive already exists (verified by scout).

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Firestore (admin SDK), React 19, vitest. Money = forest, accent = sapphire (already shipped).

## Global Constraints
- No Firestore schema migration or rules change. `logActivity` (lib/activity.ts) writes via adminDb (bypasses rules) and is `server-only` — client writes go through a new `use server` wrapper that `assertOrgMember`.
- In-app email is PAUSED (two-way sync). "Send reminder" is a **`mailto:` draft** (operator hits send), NOT `sendInvoice` (which re-issues/version-snapshots the invoice).
- Pure helpers must be pure + unit-tested. Server actions assert org membership. Run `next build` before calling the branch green (a `use server` type re-export breaks build even when tsc passes).
- Money reads from real AR (`customerAR`), never quoted pipeline. Keep that discipline.
- Re-book creates a **fresh lead** (a re-book is a new event), seeded from the source lead's `guest_count`/`event_type`/`estimated_value`.
- NBA ranking priority: **① overdue AR → ② open lead (follow-up) → ③ off-beat re-book → ④ never-booked (send proposal) → ⑤ none/healthy.**

---

### Task 1: Cadence projection + off-beat dormancy (pure)

**Files:**
- Create: `lib/crm/cadence.ts`
- Modify: `lib/crm/client-story.ts` (replace hardcoded `monthsSinceLastEvent >= 6` at ~line 60)
- Test: `__tests__/lib/crm/cadence.test.ts`

**Interfaces — Produces:**
- `effectiveCadenceMonths(row: ClientRow): number | null` — `row.cadenceMonths` when defined (3+ won events); for 2 events use the single gap; for 1 event fall back to `12`; for 0 return `null`.
- `projectedNextBooking(lastEventDate: string | null, effectiveCadenceMonths: number | null): string | null` — `addMonths(lastEventDate, cadence)` as YYYY-MM-DD.
- `offBeatMonths(row: ClientRow, todayYmd: string): number | null` — months past the projected next booking (positive = overdue on their own beat), else `null`/≤0.
- `ClientRow` already carries `lastEventDate`, `nextEventDate`, `monthsSinceLastEvent`, `cadenceMonths`, `group` (lib/crm/client-list.ts). Reuse `monthsBetween`/`cadenceOf` there.

**Steps:**
- [ ] Write failing tests: monthly client silent 3mo → NOT off-beat; yearly client at 7mo → off-beat (the bug); 2-event fallback uses single gap; 1-event fallback = 12; 0-event = null.
- [ ] Implement `lib/crm/cadence.ts`.
- [ ] Replace the `>= 6` dormancy in `client-story.ts` with `offBeatMonths(...) != null` (keep 0-event/never-booked behavior as today via the null fallback → 6mo rule preserved for no-cadence clients).
- [ ] Run tests green; commit.

---

### Task 2: Next-Best-Action ranking (pure)

**Files:**
- Create: `lib/crm/next-best-action.ts`
- Test: `__tests__/lib/crm/next-best-action.test.ts`

**Interfaces — Consumes:** `offBeatMonths` (Task 1), `ClientRow`, `Lead` (`OPEN_STAGES`, `waiting`), `Invoice`, `CustomerAR`.
**Produces:** `nextBestAction(input: { row: ClientRow; opportunities: Lead[]; invoices: Invoice[]; ar: CustomerAR; todayYmd: string }): NextBestAction` where
`NextBestAction = { kind: 'reminder' | 'followup' | 'rebook' | 'send-proposal' | 'none'; label: string; reason: string }`.
Ranking (first match wins): `ar.overdueAmount > 0` → reminder ("Send reminder — $X overdue"); any open lead (`OPEN_STAGES.includes(stage)`) → followup ("Follow up — <waiting.reason or title>"); `offBeatMonths > 0` → rebook ("Re-book — Nmo overdue on their pattern"); `row.group === 'never_booked'` → send-proposal ("Send proposal"); else none.

**Steps:**
- [ ] Write failing tests for each branch + the priority order (overdue beats everything; healthy → none).
- [ ] Implement the pure ranker. No I/O.
- [ ] Tests green; commit.

---

### Task 3: Re-book proposal seed (server)

**Files:**
- Create: `actions/proposal-rebook.ts` (or extend `actions/proposals.ts`)
- Test: `__tests__/actions/proposal-rebook.test.ts`

**Interfaces — Consumes/mirrors:** `createProposalFromTemplate` (actions/proposal-templates.ts:94 — the exact create-then-draft-core pattern), `createProposal` (actions/proposals.ts:49, accepts line_items/packages/discount/tax_rate/deposit/deposit_gate/deposit_terms/title/notes — NOT blocks), `updateProposalDraftCore` (lib/proposals/draft-core.ts — full-state; re-send title), `getProposal`, `listProposals(orgId, leadId)`, `listCustomerOpportunities`/`listLeadsByCustomerCore`, `createLead`/`createLeadCore` (accepts guest_count/event_type/estimated_value/customer_id).
**Produces:**
- `lastAcceptedProposalForCustomer(orgId, customerId): Promise<{ proposal: Proposal; lead: Lead } | null>` — join customer→leads→proposals, filter `status === 'accepted'`, newest by `client_response_at ?? created_at`.
- `createProposalFromLastAccepted(orgId, customerId): Promise<{ proposalId: string; leadId: string } | null>` (`use server`, assertOrgAdmin) — resolve source; create a **fresh lead** seeded from source lead (`guest_count`, `event_type`, `estimated_value = selection.selected_total ?? proposalDisplayRange`); `createProposal(orgId, freshLeadId, { line_items, packages, discount, tax_rate, deposit, deposit_gate, deposit_terms, title })`; if source has `blocks`/`notes`, second `updateProposalDraftCore` with `{ title, blocks, notes, line_items, packages, ... }`. Exclude token/status/signature/selection/expires_at from the copy. Return ids for redirect to the builder.

**Steps:**
- [ ] Write failing tests (mock the actions): resolver picks newest accepted; seed copies line_items+packages verbatim; fresh lead carries guest_count/value; returns null when no accepted proposal.
- [ ] Implement.
- [ ] `next build` + tests green; commit.

---

### Task 4: Contact-activity log + overdue-invoice reminder helpers (server + pure)

**Files:**
- Modify: `lib/types.ts` (ActivityEvent.kind union — add `'emailed' | 'called'`)
- Modify: `actions/activity.ts` (add `logContactActivity`)
- Modify: `lib/crm/ar-rollup.ts` (add `overdueInvoices`)
- Create: `lib/crm/reminder.ts` (mailto builder)
- Test: `__tests__/lib/crm/reminder.test.ts`, `__tests__/lib/crm/ar-rollup.test.ts` (extend)

**Interfaces — Produces:**
- `logContactActivity(orgId, { parent_type: 'customer'; parent_id: string; kind: 'emailed' | 'called' }): Promise<void>` (`use server`, assertOrgMember → `logActivity` with summary "Emailed"/"Called"). Fire-and-forget from UI.
- `overdueInvoices(invoices: Invoice[], now: Date): Invoice[]` — reuse `deriveAging` (lib/invoice-status.ts, OVERDUE buckets) + `invoiceBalance`, over `lifecycle === 'sent'`; sorted most-overdue first.
- `buildReminderMailto(email: string, invoice: Invoice): string` — `mailto:` href, `encodeURIComponent` subject "Reminder: Invoice {number} — ${balance} due {due_date}" and body incl. pay link `NEXT_PUBLIC_BASE_URL + '/invoices/' + invoice.token`.

**Steps:**
- [ ] Write failing tests: overdueInvoices filters + orders; mailto builder encodes + includes the token pay link; kind union compiles.
- [ ] Implement; add KIND_ICON entries for emailed/called in ActivityTimeline (Task 6 also touches this file — do the icon map here or defer to T6; note in the diff).
- [ ] `next build` + tests green; commit.

---

### Task 5: Header — ranked NBA primary CTA + wiring

**Files:**
- Modify: `components/admin/clients/ClientCockpit.tsx` (forward `row`, `opportunities`, `invoices` to the header — all already in scope)
- Modify: `components/admin/clients/ClientCockpitHeader.tsx` (add props: `orgId`, `row`, `opportunities`, `invoices`; render the NBA)

**Interfaces — Consumes:** `nextBestAction` (T2), `createProposalFromLastAccepted` (T3), `logContactActivity` + `overdueInvoices` + `buildReminderMailto` (T4).
**Behavior:** compute `nba = nextBestAction({row, opportunities, invoices, ar, todayYmd})`; render ONE filled **primary** button with `nba.label` and a small reason line; demote Email / Call / New job / New proposal to ghost + overflow. Wire by `nba.kind`: `reminder` → `mailto:` from `buildReminderMailto(customer.email, overdueInvoices(...)[0])`; `rebook` → call `createProposalFromLastAccepted` then `router.push` to the new proposal builder (fallback to New-proposal if null); `followup` → link to the open lead; `send-proposal` → existing New-proposal flow; `none` → keep New job as the quiet default. Fire `logContactActivity` (fire-and-forget, keep native href) on Email/Call click; header now has `orgId`.

**Steps:**
- [ ] Add/forward props; wire the CTA + behaviors.
- [ ] Verify no `mailto`/`tel` regression; buttons demoted.
- [ ] `next build`; commit. (UI — covered by walkthrough, not unit tests.)

---

### Task 6: Note composer un-collapse + trust bugs

**Files:**
- Modify: `components/admin/opportunity/ActivityTimeline.tsx` (composer; KIND_ICON for emailed/called if not done in T4)
- Modify: `components/admin/clients/ClientWorkingRail.tsx` (`EditableFact.commit()` ~104-116; the email/phone inputs)
- Test: extend the relevant component tests if present.

**Steps:**
- [ ] ActivityTimeline: remove `composerOpen` state + `onBlur` auto-collapse; always render the textarea; add `onKeyDown` firing `handleAddNote` when `(e.metaKey || e.ctrlKey) && e.key === 'Enter'`.
- [ ] EditableFact: add `error` state; wrap `onSave` in `catch(e){ setError(...) }`; render `role="alert"` sibling matching `ActivityTimeline.tsx:84` (`text-sm text-destructive`); keep the draft on failure.
- [ ] Validation: type the inline inputs `email`/`tel`; validate format on commit and block/flag an unusable value (so the header `mailto:`/`tel:` never dead-links).
- [ ] `next build`; commit.

---

## Self-Review
- Spec coverage: cadence (T1), NBA (T2), re-book seed (T3), reminder+contact-log (T4), header wiring (T5), composer+trust-bugs (T6) — the five approved moves + two trust bugs. ✅
- Deferred (NOT in scope): server-paginated/virtualized queue, command palette, queue-row AR/Past-due filter, record enrichment, the KPI-band responsive 1-col reflow (separate follow-up).
- Type consistency: `NextBestAction.kind` values used verbatim in T2 and T5; `ClientRow` fields reused, not renamed.
