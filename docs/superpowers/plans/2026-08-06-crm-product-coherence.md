# CRM Product Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three user-visible inconsistencies the CRM V1 finish-out reviews surfaced — an opportunity's title showing on some screens and the contact's name on others, a tile labelled "Last contact" that does not measure contact, and a save that gives no confirmation.

**Architecture:** Three small, independent tasks. Task 1 makes `title` settable at creation and renders it on the pipeline board. Task 2 threads the resolved title through the pure `buildToday` aggregator and its three list components, renaming the item fields from `name`/`leadName` to `title`/`leadTitle` so the type says what it holds. Task 3 is copy and a save notice. No schema changes, no new queries, no migrations.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Firestore (`firebase-admin`), Tailwind, shadcn-style primitives in `components/ui/*`, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **This is NOT the Next.js you know.** Consult `node_modules/next/dist/docs/` before any routing/server-action work; heed deprecation notices. (AGENTS.md)
- **`'use server'` modules export async functions ONLY.** Never re-export a type from `actions/*` — it passes `tsc` but breaks `next build` (RSC compiler). See the NOTE comments in `actions/leads.ts` and `actions/customers.ts`.
- **Cores (`lib/crm/*.ts`) carry no `'use server'`, no `import 'server-only'`, and call no `assert*`.** `lib/today.ts` and `lib/leads.ts` are pure — no Firestore, no auth.
- **`opportunityTitle(lead)` from `lib/leads.ts` is the single canonical way to label an opportunity.** It returns `lead.title` when present and non-blank, else `lead.name`. Never inline that fallback.
- **Health stays derived** — never store or cache an `active`/`waiting`/`needs_attention` flag.
- **Restraint (design principle):** one clear action per view; quiet, dense bordered rows, not card-soup. Mobile-responsive.
- Reads require `assertOrgMember`; writes require `assertOrgAdmin`.
- Green gate every task: `npx tsc --noEmit` clean, `npm test` passing, `npm run lint` 0 errors (20 pre-existing warnings expected). Baseline is **152 test files / 1027 tests / 0 failures**; the count only goes up.
- **Run `npm run build` before declaring the final task green** — `tsc` alone does not catch the `'use server'` type re-export failure.
- **Worktree:** all work happens in `/Users/rm/vw/traxevent/.claude/worktrees/crm-coherence` on branch `claude/crm-coherence`. Confirm `git rev-parse --abbrev-ref HEAD` before every commit. **Never commit to `main`.** Never run vitest from the primary checkout — it scans nested worktrees and produces thousands of false failures.

---

## File Structure

**Modified:**
- `actions/leads.ts` — `CreateLeadInput` gains `title?`; `createLead` stores it.
- `components/admin/LeadsBoardClient.tsx` — card label and its `aria-label` use `opportunityTitle`; new-lead form gains a Title field.
- `lib/today.ts` — item types rename `name`/`leadName` → `title`/`leadTitle`; `buildToday` resolves them via `opportunityTitle`.
- `components/admin/today/NeedsAttentionList.tsx` · `DueTasksList.tsx` · `WaitingList.tsx` — consume the renamed fields.
- `components/admin/CustomerDetailClient.tsx` — "Last contact" → "Last update"; contact form gains a save notice.
- `components/admin/ClientsTable.tsx` — "Last activity" → "Last update".
- Tests: `__tests__/actions/leads.test.ts`, `__tests__/lib/today.test.ts`, `__tests__/components/today/*.test.tsx`, `__tests__/components/admin/CustomerDetailClient.test.tsx`, `__tests__/components/admin/ClientsTable.test.tsx`.

**Created:** none. **Deleted:** none.

---

### Task 1: Title settable at creation, rendered on the pipeline board

The pipeline board is the CRM's main list view and still labels every card with `lead.name`. Worse, `CreateLeadInput` has no `title`, so a title can only ever be added after the opportunity exists — which makes the board/detail mismatch the *default* experience rather than an edge case.

**Files:**
- Modify: `actions/leads.ts` (`CreateLeadInput`, `createLead`)
- Modify: `components/admin/LeadsBoardClient.tsx`
- Test: `__tests__/actions/leads.test.ts`

**Interfaces:**
- Consumes: `opportunityTitle` from `@/lib/leads`; `Lead.title` (already exists).
- Produces: `CreateLeadInput.title?: string`; `createLead` persists `title` when non-blank.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/actions/leads.test.ts`:

```ts
it('persists a title when one is supplied', async () => {
  findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
  const lead = await createLead('o1', { name: 'Dana Kim', title: '  Riverside gala  ' })
  expect(lead.title).toBe('Riverside gala')
})

it('omits title entirely when blank', async () => {
  findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
  const lead = await createLead('o1', { name: 'Dana Kim', title: '   ' })
  expect('title' in lead).toBe(false)
})
```

The second case matters: this codebase never stores blank optional strings — every optional field uses a conditional spread so the key is absent rather than `''`. Match that.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions/leads`
Expected: FAIL — `title` is not a property of `CreateLeadInput`, and `lead.title` is `undefined`.

- [ ] **Step 3: Implement**

In `actions/leads.ts`, add `title?: string` to `CreateLeadInput` (directly under `name`), and add to the `Lead` literal in `createLead`, alongside the other conditional spreads:

```ts
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
```

In `components/admin/LeadsBoardClient.tsx`:
- Import `opportunityTitle` from `@/lib/leads` (the file already imports `LEAD_STAGES`, `LEAD_STAGE_LABELS`, `groupLeadsByStage`, `pipelineSummary` from there).
- Add a `title` state seeded `''`, reset in `resetForm()`, and a Title field as the **first** field of the new-lead form:

```tsx
<div className="space-y-1">
  <Label htmlFor="leadTitle">Title</Label>
  <Input id="leadTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Riverside gala" />
</div>
```

- Pass `title: title.trim() || undefined` in the `createLead` call.
- Change the card label at line ~158 from `{lead.name}` to `{opportunityTitle(lead)}`.
- Change the stage `<select>`'s `aria-label` at line ~172 from `` `Stage for ${lead.name}` `` to `` `Stage for ${opportunityTitle(lead)}` ``.

Leave the existing Name field and every other field untouched — `name` is still the contact's name and still required.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add actions/leads.ts components/admin/LeadsBoardClient.tsx __tests__/actions/leads.test.ts
git commit -m "feat(crm): opportunity title settable at creation and shown on the pipeline board"
```

---

### Task 2: The Today lists show the opportunity's title

All three Today lists label rows with `lead.name`. Since `buildToday` is pure and already receives the full `Lead`, the fix belongs in the aggregator — resolving the label once, rather than in three components.

Rename the fields while doing it. `NeedsAttentionItem.name` and `WaitingItem.name` currently hold what is conceptually the opportunity's label, and `DueTaskItem.leadName` likewise; naming them `title` / `leadTitle` makes the types honest and prevents the next reader from assuming they hold a person's name.

**Files:**
- Modify: `lib/today.ts` (`NeedsAttentionItem`, `DueTaskItem`, `WaitingItem`, `buildToday`)
- Modify: `components/admin/today/NeedsAttentionList.tsx` (line ~36), `DueTasksList.tsx` (line ~31), `WaitingList.tsx` (line ~31)
- Test: `__tests__/lib/today.test.ts`, `__tests__/components/today/*.test.tsx`

**Interfaces:**
- Consumes: `opportunityTitle` from `@/lib/leads`.
- Produces: `NeedsAttentionItem.title`, `WaitingItem.title`, `DueTaskItem.leadTitle` (each replacing the former `name` / `leadName`). No other field changes.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/today.test.ts`:

```ts
it('labels items with the opportunity title, falling back to the contact name', () => {
  const leads = [
    { id: 'l1', name: 'Dana Kim', title: 'Riverside gala', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'l2', name: 'Sam Lee', stage: 'proposal', created_at: '2026-08-01T00:00:00.000Z', waiting: { reason: 'deposit' } },
  ] as Lead[]
  const out = buildToday({ leads, tasksByLeadId: {}, today: '2026-08-06' })
  expect(out.needsAttention[0].title).toBe('Riverside gala')
  expect(out.waiting[0].title).toBe('Sam Lee')
})

it('labels due tasks with the opportunity title', () => {
  const leads = [{ id: 'l1', name: 'Dana Kim', title: 'Riverside gala', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z' }] as Lead[]
  const tasksByLeadId = {
    l1: [{ id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-06', done: false, created_at: 'x' }],
  } as Record<string, Task[]>
  const out = buildToday({ leads, tasksByLeadId, today: '2026-08-06' })
  expect(out.dueTasks[0].leadTitle).toBe('Riverside gala')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/today`
Expected: FAIL — `title` / `leadTitle` do not exist on the item types.

- [ ] **Step 3: Implement**

In `lib/today.ts`:
- Import `opportunityTitle` from `@/lib/leads` (the file already imports `OPEN_STAGES` and `pipelineSummary` from there).
- Rename `NeedsAttentionItem.name` → `title`, `WaitingItem.name` → `title`, `DueTaskItem.leadName` → `leadTitle`.
- In `buildToday`, replace each `name: lead.name` with `title: opportunityTitle(lead)` and `leadName: lead.name` with `leadTitle: opportunityTitle(lead)`.

Leave `company: lead.organization` exactly as it is. Contact-of-record convergence is a separate, larger backlog item and is explicitly **not** in this increment.

In the three components, update the field reference only — no markup or styling changes:
- `NeedsAttentionList.tsx` line ~36: `{item.name}` → `{item.title}`
- `WaitingList.tsx` line ~31: `{item.name}` → `{item.title}`
- `DueTasksList.tsx` line ~31: `{item.leadName}` → `{item.leadTitle}`

Then update the existing component tests' fixtures to use the renamed fields. `tsc` will point you at every site; do not add `as any` to paper over one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- today` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/today.ts components/admin/today __tests__/lib/today.test.ts __tests__/components/today
git commit -m "feat(crm): Today lists label rows with the opportunity title"
```

---

### Task 3: Honest "Last update" label and a save confirmation

Two small user-facing fixes.

**"Last contact" does not measure contact.** `rollupCustomer` computes it from the newest `updated_at`/`created_at` across a customer's leads. Notes, tasks, stage changes and activity events do not touch the lead doc, so a customer you exchanged notes with yesterday can read "8mo ago". Deriving true last-contact needs a denormalized timestamp on the activity path — a decided, deferred backlog item. The fix here is to make the label honest. `ClientsTable` already says "Last activity", which is closer but still not what it measures; unify both on **"Last update"**.

**The contact save gives no feedback.** `OpportunityDetailsForm` sets a `Saved.` notice; `CustomerDetailClient`'s contact form only calls `router.refresh()`, which produces no visible change because the fields already display the saved values. On the one screen that exists because edits used to appear to do nothing, that is the wrong omission.

**Files:**
- Modify: `components/admin/CustomerDetailClient.tsx`
- Modify: `components/admin/ClientsTable.tsx`
- Test: `__tests__/components/admin/CustomerDetailClient.test.tsx`, `__tests__/components/admin/ClientsTable.test.tsx`

**Interfaces:** none changed — copy and local component state only.

- [ ] **Step 1: Write the failing tests**

In `__tests__/components/admin/CustomerDetailClient.test.tsx`:

```tsx
it('labels the roll-up tile "Last update"', () => {
  render(<CustomerDetailClient {...props} />)
  expect(screen.getByText('Last update')).toBeInTheDocument()
  expect(screen.queryByText('Last contact')).not.toBeInTheDocument()
})

it('confirms a successful contact save', async () => {
  render(<CustomerDetailClient {...props} />)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana K' } })
  fireEvent.click(screen.getByRole('button', { name: /save contact/i }))
  expect(await screen.findByText('Saved.')).toBeInTheDocument()
})
```

Match the existing suite's button query — read how the other contact tests target the save button before writing this, and reuse that selector rather than inventing a new one.

In `__tests__/components/admin/ClientsTable.test.tsx`:

```tsx
it('labels the last-update column honestly', () => {
  render(<ClientsTable orgSlug="acme" rows={[row]} />)
  expect(screen.getByText('Last update')).toBeInTheDocument()
  expect(screen.queryByText('Last activity')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- CustomerDetailClient ClientsTable`
Expected: FAIL — labels still read "Last contact" / "Last activity", and no `Saved.` text appears.

- [ ] **Step 3: Implement**

In `components/admin/CustomerDetailClient.tsx`:
- Line ~154: `Last contact` → `Last update`.
- Add `const [contactNotice, setContactNotice] = useState<string | null>(null)` alongside the existing contact state.
- In `handleSaveContact`: clear it on entry and on the validation-failure path (`setContactNotice(null)`), and set `setContactNotice('Saved.')` after `updateCustomer` resolves, before `router.refresh()`.
- Render it next to the existing `role="alert"` error paragraph, matching `OpportunityDetailsForm`'s treatment:

```tsx
{contactNotice && <p className="text-sm text-muted-foreground">{contactNotice}</p>}
```

Follow `OpportunityDetailsForm`'s exact pattern — error and notice are mutually exclusive, and the notice is cleared before each attempt so a stale "Saved." never sits above a fresh failure.

In `components/admin/ClientsTable.tsx` line ~28: `Last activity` → `Last update`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- CustomerDetailClient ClientsTable` → PASS. Then full `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/CustomerDetailClient.tsx components/admin/ClientsTable.tsx __tests__/components/admin/CustomerDetailClient.test.tsx __tests__/components/admin/ClientsTable.test.tsx
git commit -m "fix(crm): honest 'Last update' label and a save confirmation on customer contact"
```

---

## Explicitly out of scope

Carried forward in the follow-up backlog in `docs/superpowers/plans/2026-08-06-crm-v1-finish-out.md` — do **not** pick these up here:

- **True last-contact** via a denormalized `last_contact_at` written on the activity path (decided and deferred; this increment only relabels).
- **Contact-of-record convergence** — `lib/today.ts` still reads `lead.organization` for `company` while the customer screens read `customer.company`.
- `rollup.openValue` unrendered on `/clients`; waiting's single entry point; dateless-waiting escalation.
- The correctness cluster (`email_lower` uniqueness on update, server-side name validation, `getTodayData`'s 1+N reads, the O(n²) grouping loop).
- The a11y cluster (placeholder-only labels, `scope="col"`, tile `<dl>` markup) and the remaining test-coverage gaps.
- All five unbuilt CRM V1 spec features (board polish, smart views, intake form, tag write path, email notifications).
