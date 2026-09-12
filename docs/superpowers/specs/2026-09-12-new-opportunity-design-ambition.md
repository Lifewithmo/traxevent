# New Opportunity — design-ambition gate (spec-time)

**Surface:** the "New opportunity" creation flow — `components/admin/pipeline/NewOpportunityForm.tsx` + `CustomerPicker.tsx` + `DeliveryModeToggle.tsx`, opened from the pipeline list/board (kit Dialog) and from the Clients cockpit + working rail (inline Card), backed by `createLead` in `actions/leads.ts`.

**Verdict as it ships today: bolt-on.** A schema-order stack of 11 fields with a Save button — not a `<form>`, no validation, no dupe detection, no event-type recognition, no next-step capture, no landing after Save. The public intake path (`actions/intake-public.ts`) validates more than the operator path does.

**Target for the next increment: category-defining.** The form becomes the moment the business *answers the caller* — it recognizes the caller, reads the date back against the capacity radar before Save, and books the first follow-up — using data the pipeline page already holds in memory.

This gate was run with three parallel critics (market researcher, feasibility skeptic, canon auditor); their evidence is cited inline. Nothing below is a single agent's assertion relayed as fact — the feasibility claims were refuted/confirmed against the real code.

---

## 1. Job, roles, cardinality

**Job-to-be-done (one sentence):** *"Someone just asked if we can do their event — capture who/what/when in under a minute, tell them on the spot whether the date works, and make sure the business follows up."*

**Roles (split, not averaged):**

| Role | Situation | What they need from this screen |
|---|---|---|
| **Owner-operator on the phone** (BrewTrax solo; the headline role) | Caller on the line, one hand on the phone, often on mobile | Name + phone + type + date + guests in ≤5 fields; the date verdict *while the caller is still on the line*; "we'll follow up Tuesday" captured as a real task. Never a duplicate client. |
| **Owner at the desk, working an email/DM** | Has the full contact, maybe a budget | Same core, plus email/org/value/notes without scrolling past them to Save. |
| **Owner on the Client cockpit** ("New job for Jane") | Customer already known | Skip *who* entirely; pre-fill type/guests from her last job; land back on her cockpit with the new job in the rail. |
| **Client (inbound, public intake)** | Not this surface — but the shared validator and shared "what happens after" must agree. | — |

**Cardinality profile:**

| Thing the operator faces | n | Pattern |
|---|---|---|
| Existing customers to link | n:many (hundreds) | typeahead combobox — already right; add **recognition from what's typed** (phone/name/email), not only from a dedicated search box |
| Event types | n:few (3–10 profiles + history) | picklist chips + free text; never a blank box that silently breaks capacity math |
| Alternative dates when the date is closed | n:few (3) | inline chips, one tap to adopt |
| Fields | 5 core / 6 more | core above the fold; "more" is a disclosure, not a scroll |
| Empty states | 0 customers, 0 profiles, 0 units | onboarding: "first client" cue; "type any event type — configure profiles to get capacity verdicts →" |

---

## 2. Market bar (researched fresh 2026-09-12)

Audited from the operator's lived experience (steps from phone call to saved), primary sources only; rows without one are marked unverified.

| Product | Entry | Required | Availability / conflict check at creation | Contact dedupe | After save | Keyboard | Source |
|---|---|---|---|---|---|---|---|
| **HoneyBook** (the competitor we displace) | `+ New › Project` dialog | name + project type — **the date is not in the create dialog**; set later in Details | **None at create.** An "other projects on this date" pop-up exists only behind an undocumented Company Settings › Preferences toggle; users reported it silently vanishing (community thread, Jan–May 2025) | existing-client dropdown; no email dedupe on the manual path | project workspace; no task, no reply for manual leads | none | [start a project](https://help.honeybook.com/en/articles/2209127-start-a-project-and-set-project-dates), [set dates](https://help.honeybook.com/en/articles/5743418-set-project-dates), [conflict pop-up thread](https://community.honeybook.com/honeybook-product-talk-7/calendar-availability-pop-up-upon-new-project-date-selection-4404), [leads](https://help.honeybook.com/en/articles/6554485-manage-your-leads-in-honeybook) |
| Dubsado | New Project form | title, contact, status; date behind "Add more details" | **None.** "Date Conflicts" approval button exists but *"will not appear on projects you create manually"* | contact dropdown | project | none | [creating projects](https://help.dubsado.com/en/articles/11402636-creating-projects), [date conflicts](https://help.dubsado.com/en/articles/5031747-date-conflicts-setting) |
| 17hats | Leads › + → modal reusing a lead-capture form | name + email | none | unverified | hot-lead contact + project; workflow starts | none | [manually adding leads](https://help.17hats.com/en/articles/2509970-manually-adding-leads) |
| Tripleseat | New Event → full page (~8 steps) | name, status, start/end, **room**, guest count; account+contact first | **Room-level, blocking, at save** — status overlap matrix; Prospects may overlap | search-or-create popup | Event Details | none | [create an event](https://support.tripleseat.com/hc/en-us/articles/1500010839401-How-to-create-an-event), [status rules](https://support.tripleseat.com/hc/en-us/articles/12444237213079-How-to-change-Event-Status-Rules) |
| Goodshuffle Pro | Create New Project → page (~4 steps) | effectively none; client name+email | **Not on the date** — *"Event Dates are for reference only and do not impact … availability"*; conflicts fire when adding inventory, non-blocking | type-ahead search-or-create | project Contract tab | none | [availability](https://help.goodshuffle.com/en/articles/1643596-understanding-item-availability-and-conflicts), [event dates](https://help.goodshuffle.com/en/articles/3084758-how-to-set-the-event-dates-on-a-project) |
| Curate | + New Project → slide-in panel | name, date, contact (3 fields — fastest to saved) | none documented | dropdown + add-new inline | Workroom | none | [first project](https://help.curate.co/en/articles/9653177-creating-your-first-project) |
| Releventful | full page ×2 (lead, then event) | first, last, email; event name/type/start/end | only when reserving a room (step 3), warn-not-block | none on lead form | pop-up offers to create event | none | [add a lead](https://help.releventful.com/en/articles/5890114-manually-add-a-new-lead) |
| Planning Pod | Add Lead form | name, color, start/end | **after save** — dashboard red/green conflicts panel | picker, no dedupe | Lead Dashboard | none | [adding a lead](https://planningpod.com/help-center/adding-a-new-lead) |
| Perfect Venue | manual create undocumented | (inbound) name, date, start, size, type | space-based blocking exists; timing unverified | unverified | inbound: AI first reply + **automated task on status=Lead** (the only vertical precedent for "create → next action queued") | none | [automated tasks](https://help.perfectvenue.com/knowledge/automated-tasks), [AI assistant](https://help.perfectvenue.com/knowledge/ai-event-assistant) |
| Pipedrive | + Deal modal (configurable fields) | person/org (autocomplete or create), title; admin-required fields | n/a (no date logic) | inline autocomplete + create | pipeline card; next-activity nudge | unverified | [add deals](https://support.pipedrive.com/en/article/deals-what-they-are-and-how-to-add-them) |
| Attio | ⌘K "Add", + in any view | none; email/domain drive dedupe + enrichment | n/a | **email/domain dedupe with merge prompt; auto-link person↔company** | record page | command palette | [create records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records), [duplicates](https://attio.com/apps/check-for-duplicates) |
| **Linear** (craft bar) | `C` anywhere → modal over current view | title (+ defaulted status) | n/a — but **"similar issues" surface under the modal while typing** | n/a | stays in view; toast; **Create more** | `⌘↩` save, `⌘⇧↩` save+another, property shortcuts, drafts auto-saved | [creating issues](https://linear.app/docs/creating-issues), [similar issues](https://linear.app/changelog/2023-08-03-similar-issues) |
| Tave, HubSpot | unverified (not reached in the time box) | | | | | | — |

**Findings**

1. **Best flow today, lived-experience:** Linear (one key from anywhere, defaults from context, duplicates surfaced while typing, `⌘↩` / `⌘⇧↩`, drafts never lost). In the vertical nobody is close: Curate is fastest-to-saved, Tripleseat is the only one that blocks a real double-booking (room-level, at save), Attio is best at contact identity.
2. **What leaders have that an 11-field modal lacks:** global shortcut + non-navigating modal; two required fields with progressive disclosure; defaults inherited from where you are; identity-aware contact field (autocomplete + create + dedupe/merge); live "already exists" under the form; `⌘↩` and save-and-create-another; draft persistence; landing with toast/link; next action queued at create (Perfect Venue automation; Pipedrive nudge).
3. **Does any vertical product check availability/capacity while the operator is still typing the date? No** — confirmed across every vertical product with a primary source. Goodshuffle states outright that the event date is decoupled from availability; Tripleseat's block fires at save; HoneyBook's pop-up is a hidden preference that fires after the date is picked in a later step; Dubsado's exempts manual projects; Planning Pod's is a post-save dashboard. A live verdict at the date field is **net-new in the category**.
4. **HoneyBook's concrete weaknesses this surface must visibly beat:** (a) the date isn't in the create dialog — create → open → Details → date → back; (b) conflict awareness is a hidden, undocumented, unreliable preference; (c) no capacity concept even when it fires — same-date projects only, nothing about units; (d) manual leads get no automation — no task, no reply, AI scoring only for inbound; (e) weak contact identity on the manual path (dropdown only; multi-project-per-client sprawl complaints); (f) zero keyboard craft.

**Parity test for this increment:** "Would this ship at Linear?" (keyboard, defaults, dupes-while-typing, toast, create-more) and "What does it do that Tripleseat can't?" (verdict + alternatives *before* save, unit-aware, on mobile, without a room-only model).

---

## 3. Canon × market cross-validation

| market pattern | canonical principle | verdict |
|---|---|---|
| Quick-create modal with Enter-to-submit, ⌘↩, autofocus (Linear, Pipedrive) | Nielsen #7 flexibility/efficiency; Fitts (no pointer travel); Shneiderman "shortcuts for experts" | **Bedrock** — adopt |
| Inline duplicate detection as you type ("Looks like Jane Doe — link?") (HubSpot, Attio, Dubsado) | Nielsen #5 error prevention; Norman feedback | **Bedrock** — adopt; ours is stronger because `customers` is already in client memory (zero reads) |
| Typed picklists for deal type/pipeline (Pipedrive, HubSpot) | Nielsen #6 recognition over recall | **Bedrock** — adopt as chips + free text (profiles are an overlay, not a migration) |
| Land on the created record after save (every CRM) | Nielsen #1 visibility of status; Doherty (closing the loop) | **Bedrock** — adopt (toast-with-link from pipeline; stay in place on cockpit) |
| Follow-up task at creation ("next activity" — Pipedrive forces it) | Cooper goal-directed: the goal is the *booking*, not the record | **Bedrock** — adopt as one optional row; the product already scolds a task-less lead one click later |
| Calendar availability pop-up on date pick (HoneyBook — buried behind a Preferences toggle, undocumented) | Nielsen #1 + #5; Tesler (system absorbs the "am I free?" lookup) | **Reconciled tension** — HoneyBook shows *other bookings*; we show a *verdict with a binding constraint and alternatives*. Adopt the stronger form. |
| Progressive disclosure of optional fields (Attio, Linear "more") | Miller (≤7 above fold); Rams "as little design as possible" | **Bedrock** — adopt |
| Estimated value inference from history | Anticipation (Tesler/Shapiro) | **Novel extension** — no exemplar prefills deal value from cohort history; adopt with an inspectable basis ("median of 6 won weddings") or don't prefill at all |
| Dense 11-field first-contact forms (Dubsado/17hats default lead capture) | Violates Miller, Wroblewski "ask only what you need now" | **Fashion/legacy** — reject |

---

## 4. Critic-lens panel (grades + ratchets)

Full NN/g scoring, interaction-cost counts, WCAG table and 16-item defect list are in the canon-audit appendix (§A). The ratchets:

1. **Job / goal-directed** — the form conflates *record entry* with *answering a caller*. Ratchet: the screen must produce an **answer** ("Yes, Sat Oct 4 is open — cart 2 is free") and a **commitment** (follow-up task), not a document.
2. **Nielsen** — severity-4s: not a `<form>` (no Enter, no native validation), server accepts anything but name, phone-only callers create duplicate customers. Severity-3s: no post-save status, free-text event type vs. authoritative profiles, focus dropped after picking a client, error not tied to its field.
3. **Interaction cost** — worked budget on the headline flow (new caller, 5 facts):
   - **Today:** 12 fields rendered, **14 tab stops**, Save **below the fold at both 375 and 768** on the unlinked path, 0 errors prevented.
   - **Target:** 5 core fields, **≤7 tab stops** to Save (name, phone, type, date, guests, follow-up, ⌘↩), Save visible in a sticky footer at 375, verdict rendered <100 ms after the date is complete (pure client-side `bookability()`), duplicate hint rendered as the phone/email is typed.
   - Ratchet: what a command-palette-first product removes entirely — the *search box for the customer*. Recognition happens from the name/phone fields themselves; the picker becomes the fallback, not the first tab stop.
4. **Named-exemplar parity** — Linear for the dialog craft (keyboard, autofocus, "create more"), Pipedrive for forced next-activity, HubSpot/Attio for inline dupe match. Exact gap after this increment: none of them can say *whether the business can serve the date* — that is ours.
5. **Craft / restraint** — Rams would cut: the dedicated "Link to existing customer" search box (fold it into recognition), "Title" as a leading field (derive: "Jane Doe · Wedding · Oct 4"), the hand-styled textarea, placeholder "0"s.
6. **Anticipation** — what it could infer but still asks for: customer identity (from phone/email), event type (chips from profiles + the org's own history), title (derived), delivery mode (from the matched profile's `needsVenue`), estimated value (cohort median, inspectable), follow-up date (default: `today + 2` business days), the date verdict itself.

---

## 5. The category-defining mechanism

**"Answer the caller before you hang up."** As the operator types the event date, the form renders the same **bookability verdict** the calendar cockpit computes — `open / tight / closed`, the binding constraint in operator language ("Both carts are out on Oct 4 — Riverside gala and the Farmers market"), the provenance line, and **three next open dates as one-tap chips** that set the field. On `closed`, Save is not vetoed (the operator can still take it and sub-rent a cart) — the verdict informs, it does not gate.

Why no horizontal product has it: it depends on the vertical's real conditions — serviceable days, prep lead time, per-unit capacity, event-type resource profiles — which TraxEvent already models (`lib/calendar-bookability.ts`, `lib/capacity/*`). HoneyBook's closest move (an undocumented "other bookings on this date" pop-up) shows a list, not a verdict, and offers no alternative.

Paired with it, two supporting moves that make the mechanism honest:
- **Caller recognition** — typing a phone number or email that matches an existing customer shows "This looks like Jane Doe · 3 past jobs — link?" inline (zero reads; `customers` is already in memory). Prevents the duplicate-client bleed that the headline flow causes today.
- **First follow-up at birth** — an optional "Follow up by ⟨date⟩" row creates the task in the same server action, so the lead is not born `needs_attention`.

---

## 6. Increment scope (this increment)

### Form composition (task-flow order, not schema order)

```
┌ New opportunity ───────────────────────────────────── ✕ ┐
│ WHO                                                       │
│  Name*            [Jane Doe            ]  ← autofocus     │
│  Phone            [(208) 555-0142      ]  type=tel        │
│  ▸ "Looks like Jane Doe · 3 past jobs · last: Wedding"    │
│    [Link]  [No, new client]                               │
│  Email · Organization           (disclosure: "more")      │
│                                                           │
│ WHAT & WHEN                                               │
│  Event type       [Wedding] [Corporate] [Market] [+ type] │
│  Event date       [ 2026-10-04 ]   Guests [ 120 ]         │
│  ┌ ● Open for booking — nothing on file stands in the way │
│  │   Sat Oct 4 · 22 days out · book-by Sep 20        ┘   │
│  (or)                                                     │
│  ┌ ● Closed — both carts are out on Oct 4                 │
│  │   Riverside gala · Farmers market                      │
│  │   Next open: [Sat Oct 11] [Sat Oct 18] [Sat Oct 25]    │
│  │   capacity · 2 carts, 2 booked · fix →                 │
│  Where            (Offsite | On-site)  ← only when the org has a room │
│                                                           │
│ NEXT                                                      │
│  Follow up by     [ Tue Sep 15 ]  (default +2 biz days)   │
│  Estimated value · Notes         (disclosure: "more")     │
│                                                           │
├──────────────────────────────────────────────── footer ───┤
│  [Create opportunity  ⌘↩]   Cancel                        │
└───────────────────────────────────────────────────────────┘
```

- Real `<form onSubmit>`; Enter in any text field submits; ⌘/Ctrl+↩ submits from anywhere (incl. the textarea); ⌘/Ctrl+⇧+↩ = save and create another (Linear parity) — keeps event type/date, clears who.
- Sticky `DialogFooter`; the form fits at 375×812 with the core fields and the footer visible.
- Title is derived (`name · type · short date`) and editable under "more".
- Event type: chips from `org.event_type_profiles` names ∪ distinct historical `lead.event_type` (in memory), plus free text. Matched profile drives `Where` visibility (`needsVenue`) and the verdict's requirement. Free text that matches no profile shows a one-line hint, never blocks.
- Date: `min = today` soft (past date allowed with an explicit warning, never silently).
- Verdict: `bookability(date, ctx)` client-side; `BookabilityBanner` extracted from `DaySpine.tsx` with an `onPickAlternative(ymd)` prop (buttons in the form, Links on the calendar). Past dates: warn as "past date" rather than the engine's literal `closed`.
- Caller recognition: normalized phone (digits) and `email_lower` match → inline card with Link / New. Name-only match → "Did you mean…" (never auto-link).
- Follow-up: optional date; when set, `createLead` creates the task atomically and logs a `created` activity (the `'created'` kind exists in the union with zero producers today).
- After Save (pipeline): dialog closes, toast "Opportunity created — Jane Doe · Wedding · Oct 4 [Open]" linking to `/leads/{id}`; the new row is highlighted. After Save (cockpit): stays on the cockpit, rail shows the new job; both cockpit call sites wrapped in the same Dialog (one instance per page — today there are two, with duplicate ids).
- Server: lift the intake validators into a shared `validateLeadInput` used by both `createLead` and `submitIntake` (email regex, ISO date, integer guests 0–100000, value ≥ 0, lengths).

### Data (verified, not asserted — feasibility skeptic report)

- **Pipeline page:** `buildBookabilityCtx` with the leads/org/units the page already loads **+ one added `loadCalendarEvents(orgId, null, null)` read** (the "zero new reads" claim was refuted: `calendarDemand` requires events). Ctx is plain JSON, ~25–35 KB at 200 dated jobs.
- **Cockpit page:** lazy — a server action loads the ctx once when the form opens (+2–3 reads), since most cockpit visits never open it.
- **No schema migration.** Additive only: `Task` creation in the same action; `'created'` activity.
- Effort: **M** overall (extraction of `BookabilityBanner` is the only non-trivial move).

### Hard gates checked at build
- WCAG 2.2 AA: `aria-required` on Name; error via `aria-describedby` + `aria-invalid`; focus moves to the next field after Link; a real `<h2>` in the dialog; targets ≥24 px (kit already passes); reduced-motion already handled by the kit Dialog.
- Dark mode via tokens (verdict tones already tokenized in `BookabilityMark`).
- Latency: verdict is pure/in-memory → <100 ms; Save is optimistic-closing with the toast carrying the link.
- Empty states: 0 customers → "This will be your first client"; 0 profiles → hint linking to `/capacity`; ctx null (base tier, no units) → the degraded verdict still speaks honestly ("2 jobs already on this date" / "nothing on file").
- Mobile 375 / tablet 768 / desktop walkthrough on the Vercel preview before merge.

### Out of scope (named, not forgotten)
- Estimated-value cohort prefill — deferred: free-text type fragmentation splits cohorts until chips have been in use; ship chips first, then prefill with basis.
- Command-palette "New opportunity" from anywhere — next increment.
- Bulk import — separate surface.

---

## 7. Ambition ladder, honestly

| Tier | What it takes | This increment |
|---|---|---|
| bolt-on | today | — |
| good | real form, validation, dupe hint, chips, sticky footer, toast (defects 1–8) | ✔ |
| great | + follow-up at birth, task-flow order, cockpit parity, focus/ARIA correctness (9–12) | ✔ |
| category-defining | + the date verdict with alternatives at the field, before Save | ✔ — this is the mechanism no horizontal product has |

If the verdict block is cut for time, the increment drops to **great** and must be labeled so.

---

## Appendix A — canon audit (verbatim findings, evidence cited)

_(see the critic report; severity-ordered defect list 1–16 reproduced below at build time as the acceptance checklist)_

## Appendix B — feasibility skeptic (verbatim verdicts)

_(reproduced below at build time)_
