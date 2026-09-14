# New Opportunity increment 1 — implementation plan & contracts

Spec: `docs/superpowers/specs/2026-09-12-new-opportunity-design-ambition.md` (§6 is the scope; §A defect list is the acceptance checklist). Target tier: **category-defining** — the live bookability verdict at the date field is the non-negotiable headline; everything else supports it.

**Worktree:** all work happens in `/Users/rm/vw/traxevent/.claude/worktrees/new-opp-ambition` on branch `new-opportunity-ambition` (base = origin/main ccf21f7). Agents: verify `pwd` and `git branch --show-current` before any edit; never cd to `/Users/rm/vw/traxevent`; never commit; never `npm install`; run only your own test files (`npx vitest run <your test paths>`), never the full suite.

Four implementers, strict disjoint file ownership. The contracts below are fixed — build to them exactly so parallel work compiles together.

---

## Shared contracts (all agents build to these)

### C1 — `lib/crm/validate.ts` (NEW, Agent S) — pure, client-safe, no 'use server', no I/O

```ts
export interface LeadFieldErrors {
  name?: string; email?: string; phone?: string; event_type?: string;
  event_date?: string; guest_count?: string; estimated_value?: string; notes?: string
}
/** Empty object = valid. Messages are operator-readable sentences. */
export function validateLeadFields(fields: {
  name?: string; email?: string; phone?: string; event_type?: string;
  event_date?: string; guest_count?: number; estimated_value?: number; notes?: string
}, opts?: { requireName?: boolean; requireEmail?: boolean }): LeadFieldErrors
```

Rules (superset of today's intake checks, `actions/intake-public.ts:83-99`): name required when `requireName` (≤200 chars); email required when `requireEmail`, else optional but validated when present (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, ≤200); phone/event_type ≤200; notes ≤2000; event_date `^\d{4}-\d{2}-\d{2}$` when present; guest_count integer 0–100000; estimated_value finite number 0–100_000_000. A **past** event_date is NOT an error (client renders a warning; the operator may back-log).

### C2 — `actions/leads.ts` (Agent S)

```ts
export interface CreateLeadInput {
  // ...all existing fields unchanged, plus:
  follow_up_date?: string    // ISO ymd; when present, a Task is created with the lead
  follow_up_title?: string   // default: 'Follow up with {first word of contact name}'
}
// createLead(orgId, input): validates via validateLeadFields (requireName when no customer_id;
// throws Error with the first error message), then writes lead + follow-up task in ONE
// Firestore batch commit (task doc under leadsRef(orgId).doc(id).collection('tasks'), shape per
// actions/tasks.ts:17-27), then best-effort logActivity({parent_type:'opportunity', parent_id,
// kind:'created', summary}) AFTER the business write commits (mirror intake-public.ts:119 comment).
// summary: 'Opportunity created' or 'Opportunity created · follow-up booked for {ymd}'.
// Return type stays Promise<Lead>.
```

`lib/crm/leads.ts` may gain a minimal seam for the batch (e.g. `createLeadCore(orgId, input, opts?: { alsoWrite?: (batch: FirebaseFirestore.WriteBatch, lead: Lead) => void })`) — keep the no-opts path byte-for-byte identical.

### C3 — `actions/bookability.ts` (NEW, Agent S)

```ts
'use server'
// Wraps orgBookabilityCtx (lib/calendar-fetch.ts:273 — it already runs assertOrgMember).
export async function getBookabilityCtx(orgId: string, orgSlug: string): Promise<BookabilityCtx | null>
```
Uses `todayYmd()` from `lib/opportunity-detail` for the `today` argument. NOTE ('use server' rule, AGENTS.md + memory): **no type re-exports** from this module.

### C4 — `components/admin/calendar/BookabilityBanner.tsx` (NEW, Agent B)

```ts
export function BookabilityBanner(props: {
  orgSlug: string
  bookability: Bookability
  /** When present, alternative-date chips render as <button type="button"> calling this
   *  instead of Links to the calendar. Fix-links stay Links in both modes. */
  onPickAlternative?: (ymd: string) => void
  className?: string
}): React.ReactElement
```
Moved verbatim from `components/admin/calendar/DaySpine.tsx:283-389` (keep `data-slot="bookability-banner"`, `data-verdict`, `data-basis`, the AA-contrast comment, the never-blocks doctrine comment). `className` merges onto the root of both branches.

### C5 — `components/admin/pipeline/NewOpportunityForm.tsx` (Agent F) — new props

```ts
interface NewOpportunityFormProps {
  orgId: string
  orgSlug: string
  open: boolean
  onClose: () => void
  customer?: Customer                 // cockpit: pinned; hides Who section's picker+contact fields
  customers?: Customer[]              // pipeline: picker + caller recognition
  showDeliveryMode?: boolean
  eventTypeOptions?: string[]         // ordered: profile names first, then historical by frequency
  bookabilityCtx?: BookabilityCtx | null          // pipeline: preloaded at page render
  loadBookabilityCtx?: () => Promise<BookabilityCtx | null>  // cockpit: lazy, called once on first open
  initialValues?: { event_type?: string; guest_count?: number }  // cockpit: prefill from last job
  onCreated?: (lead: Lead) => void    // fires after each successful create (also on create-another)
}
```
**The form now owns its Dialog** (kit `Dialog`/`DialogContent`/`DialogTitle`/`DialogFooter` from `components/ui/dialog.tsx`). Call sites stop wrapping it and drop the `[&_[data-slot=card]]` strip hacks.

---

## Agent S — server & validation

**Owns:** `lib/crm/validate.ts` (new), `actions/leads.ts`, `lib/crm/leads.ts` (batch seam only), `actions/bookability.ts` (new), `actions/intake-public.ts`, tests: `__tests__/lib/validate-lead.test.ts` (new), any existing `__tests__/actions/leads*` / intake tests you must keep green (check `ls __tests__/actions`).

1. C1 validator, TDD (write the test file first; cover every rule + the past-date-is-valid case).
2. C2: validation + batch task + `created` activity. The task write must be in the same batch as the lead doc; activity is best-effort after commit (a thrown activity error must not fail the create — see `lib/activity.ts:25` try/catch precedent, verify it swallows).
3. `actions/intake-public.ts`: replace the inline field checks (lines ~83–99) with `validateLeadFields(..., {requireName: true, requireEmail: true})`, throwing the first error. Keep the bot/honeypot/rate-limit logic, message-length rule (notes ≤2000 covers it), and all writes byte-for-byte otherwise. Existing intake tests must pass unchanged (or with message-string updates only if the shared messages differ — prefer keeping the exact current strings in the shared validator).
4. C3 action. No type re-exports.

## Agent B — banner extraction

**Owns:** `components/admin/calendar/BookabilityBanner.tsx` (new), `components/admin/calendar/DaySpine.tsx` (only: delete the local component, add the import), tests: new `__tests__/components/calendar/BookabilityBanner.test.tsx`; find and keep green any existing DaySpine tests that assert on `data-slot="bookability-banner"` (grep `__tests__` for `bookability`).

DaySpine's rendered output must be **byte-for-byte identical** (no `onPickAlternative` passed there). New test: chips render as buttons and fire `onPickAlternative('2026-…')` when the prop is present; as Links when absent; `className` lands on the root in both the open-line and the panel branches.

## Agent F — the form

**Owns:** `components/admin/pipeline/NewOpportunityForm.tsx` (rewrite), `components/admin/pipeline/CustomerPicker.tsx`, optional new siblings in `components/admin/pipeline/` (`EventTypeChips.tsx`, `CallerMatchHint.tsx`, `FollowUpField.tsx` — your call, keep them small), tests: `__tests__/components/admin/pipeline/new-opportunity-form-linked.test.tsx` (update), NEW `__tests__/components/admin/pipeline/new-opportunity-form.test.tsx`, `__tests__/components/admin/pipeline/customer-picker.test.tsx` (update).

Composition (spec §6 wireframe — task-flow order, NOT schema order):

1. **Dialog shell**: `DialogContent` = header + scrollable body + **sticky `DialogFooter`** (footer outside the scroll region; body `overflow-y-auto`, content `max-h-[85dvh]`). Visible heading: an `h2` "New opportunity" (defect #16) — no sr-only duplicate. At 375×812 the Who+What&When core and the footer must be simultaneously visible for the linked/new-caller path.
2. **Real `<form onSubmit>`** — Enter in any text input submits; ⌘/Ctrl+↩ submits from anywhere including the textarea; **⌘/Ctrl+⇧+↩ = save & create another** (stays open, keeps event_type/date/where/guests? NO — keeps event_type, event_date, delivery mode; clears who/guests/value/notes; follow-up resets to default; focus returns to Name). Submit button label "Create opportunity", never disabled for validation reasons — validate on submit, show field errors (defect #8).
3. **WHO**: Name* (autofocus when no `customer`; `aria-required`), Phone (`type="tel" inputMode="tel" autoComplete="off"`). **Caller recognition**: as name/phone/email are typed, match against `customers` — phone by digits-only comparison (≥7 digits), email case-insensitive exact, name case-insensitive exact → render one inline hint card "Looks like {name}{company} · {n} past jobs" with [Link] and [No, new client] (dismiss remembers per-open). Linking snaps to the `customer_id` path (same as picker). Never auto-link on name alone. The `CustomerPicker` stays as the explicit fallback ("or search clients"), collapsed to a single line until focused. When `customer` prop present: WHO renders the pinned "For {name}" line only.
4. **WHAT & WHEN**: Event type = chip row from `eventTypeOptions` (single-select toggle; free-text input always available; a typed value matching no profile when the org HAS profiles shows the quiet hint "not a configured event type — capacity uses the default rule"; no options at all → plain input). Date + Guests on one row (`min` NOT set — a past date shows an amber inline note "That date is in the past", non-blocking; guests `type="number" inputMode="numeric" min={0} step={1}`). **The verdict**: when a complete valid date is set and ctx is available, `useMemo` → `bookability(eventDate, ctx)` from `lib/calendar-bookability` and render `<BookabilityBanner orgSlug bookability onPickAlternative={setEventDate}/>`. Past dates: render the amber note INSTEAD of the engine verdict (mirror `useDayVerdict`'s tense rule, `bookability-context.tsx:44-53`). Ctx sourcing: `bookabilityCtx` prop if provided, else `loadBookabilityCtx()` once on first open (loading = render nothing, no spinner jitter; failure = render nothing). No ctx at all → no verdict block (degrade silently). `showDeliveryMode` → the existing `DeliveryModeToggle` after the date row.
5. **NEXT**: "Follow up by" date, default = today + 2 business days (skip Sat/Sun), clearable (empty ⇒ no task). Helper: "Creates a task so this opportunity is born with a next step."
6. **"More details" disclosure** (collapsed by default): Title (placeholder shows the derived label "{name} · {type} · {Mon D}" but the field submits ONLY what the user types — never persist the derived string), Organization, Email (`type="email"`, validated on submit when present), Estimated value (`inputMode="decimal" min={0}`, $ prefix affordance), Notes (kit-consistent styling — match Input's tokens: `rounded-lg`, `ring`/`aria-invalid` classes from `components/ui/input.tsx`; do NOT edit the ui kit).
7. **Validation & errors**: client-side `validateLeadFields` on submit; per-field messages under the field via `aria-describedby` + `aria-invalid`; server error falls back to the top `aria-live` slot. First invalid field gets focus.
8. **Close semantics**: ANY close (Escape, backdrop, X, Cancel) resets the draft (defect #10 — one consistent behavior). CustomerPicker's Escape-eats-the-event hack must stay so list-dismiss ≠ dialog-close.
9. **After create**: `await createLead(...)` → `onCreated?.(lead)` → normal path: reset + `onClose()` + `router.refresh()`; create-another path: partial reset, stay open, still `router.refresh()`.
10. **CustomerPicker fixes**: after pick, move focus to the next logical field (event type input) instead of dropping it; add an sr-only live region "N clients match"; render a "No matching clients" option-less state when query ≥2 chars and 0 matches.

Follow TDD; jsdom tests must cover: submit via Enter, ⌘↩, create-another retention set, recognition match on phone digits, link/dismiss, verdict renders for a closed date (feed a hand-built degraded-arm ctx: `{mode:'degraded', conflictDates:[d], bookedCounts:{[d]:2}}`), alternative chip click sets the date field, past-date note, follow-up default = +2 business days across a weekend boundary, validation focus + aria wiring, close-resets-draft.

## Agent C — call sites & data threading

**Owns:** `app/(admin)/[orgSlug]/leads/page.tsx`, `components/admin/pipeline/PipelineListClient.tsx`, `components/admin/pipeline/PipelineBoardView.tsx`, `components/admin/pipeline/CreatedToast.tsx` (new), `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx`, `components/admin/clients/ClientCockpit.tsx`, `components/admin/clients/ClientWorkingRail.tsx`, tests: `PipelineListClient.test.tsx`, `PipelineBoardView.test.tsx` (update), `__tests__/components/clients/ClientWorkingRail.test.tsx` + any cockpit test (update), new `__tests__/components/admin/pipeline/created-toast.test.tsx`.

1. **Pipeline page** (`leads/page.tsx`): import `buildBookabilityCtx` from `lib/calendar-bookability` and `orgEvents` from `lib/calendar-fetch`; `const events = await orgEvents(orgId)` (fold into the existing parallel loads — ONE added query, spec-approved); `const bookabilityCtx = buildBookabilityCtx({orgSlug, org: {plan: orgData.plan, prep_lead_days: orgData.prep_lead_days}, leads, events, units, today})`. Compute `eventTypeOptions`: profile names (in profile order) then distinct historical `lead.event_type` values (trimmed, case-insensitive dedupe against profiles and each other) ordered by frequency desc, capped at 8 total. Thread `orgSlug`, `eventTypeOptions`, `bookabilityCtx` into both views via `shared`.
2. **PipelineListClient / PipelineBoardView**: delete the local `Dialog` wrapper + strip-class div around the form (the form owns its Dialog now — pass the new props straight through). Add `onCreated`: set `created` state `{lead}` → render `<CreatedToast>` and highlight the new row (row with `lead.id` gets a temporary `ring-2 ring-[--accent]`-style pulse for ~4s after refresh; match by id when rows re-render). Toast copy: "Opportunity created — {name}{· type}{· Mon D}" with an "Open" link to `/${orgSlug}/leads/${lead.id}`; auto-dismiss 8s; `role="status"`; dismiss button ≥24px.
3. **CreatedToast** (new, `components/admin/pipeline/`): tiny, self-contained, tokens-only styling, `motion-reduce` safe. Not in `components/ui` (the kit is frozen).
4. **Cockpit page**: also load org doc fields it currently discards — `event_type_profiles`, `plan`; `units = hasMultiResourceCapacity({plan}) ? await listCapacityUnitsCore(orgId) : []`; `showDeliveryMode = units.some(u => u.kind==='venue' && u.active)`. `eventTypeOptions` from profiles + THIS customer's `opportunities` types (same dedupe/frequency rule). Thread to `ClientCockpit`.
5. **ClientCockpit / ClientWorkingRail**: ONE form instance per page — `ClientCockpit` keeps `creatingJob` and renders the form; `ClientWorkingRail` loses its instance + local state and gains `onNewJob?: () => void` for its trigger button. Pass `loadBookabilityCtx={() => getBookabilityCtx(orgId, orgSlug)}` (import the server action from `actions/bookability` — Agent S ships it; build against the C3 signature), `initialValues` from the customer's most recent opportunity (`event_type`, `guest_count`), `showDeliveryMode`, `eventTypeOptions`, `onCreated` → toast "Job created for {customer.name}" (reuse `CreatedToast`).
6. Keep `IntakeLinkCard` exactly as is (it owns its own Dialog).

**Interface note:** Agents F and C both build against C5 exactly. C may stub the form in its tests (mock the module) so its tests don't depend on F's internals.

---

## Hard gates (block "done" — from spec §6)
- WCAG 2.2 AA: labels, `aria-required`, error association, focus management, ≥24px targets, real heading in the dialog.
- Dark mode: tokens only; no raw hex/gray classes.
- `prefers-reduced-motion`: any pulse/toast animation guarded.
- Empty states: 0 customers → "This will be your first client" line; 0 profiles → default-rule hint; null ctx → no verdict block, everything else fully functional.
- No blank empty state, no disabled-submit-as-validation.
- The verdict **informs, never gates** — Save always live.

## Verification protocol (orchestrator runs after integration)
`npx vitest run` (full), `npx next build`, then adversarial review fleet + fix rounds, then the three-viewport walkthrough on the Vercel preview before merge.
