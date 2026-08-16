# TraxEvent Design Ambition Standard

> **Status:** the design bar for the product. This **supersedes** the old
> "definition of consistent" (kit adoption + tokens + responsive + space-filling
> checklist). That checklist was a *floor*, and a bolt-on satisfies every item
> on it — which is exactly how Calendar/Today/Invoices-record-side passed review
> green while delivering no structural change. This document raises the bar and
> makes it **external, gradeable, and one-directional (it only ratchets up).**
>
> **Method:** the reusable methodology lives in the `design-ambition` skill.
> This doc is the **TraxEvent instantiation** — our exemplar bar, our per-surface
> playbooks, our vertical, our modules.
>
> **The rule that governs everything:** great is not our opinion and not the
> user's burden to supply — it is the intersection of the design **canon** and
> the current **market leaders**, judged from the **end user's lived
> experience**. The gate can raise the bar; it can never lower it. **Cost is
> never a reason to lower it.** Great-but-expensive beats cheap-but-forgettable.

---

## 1. What "great" means here (three gates, all required)

Great = clears all three simultaneously. Craft alone or novelty alone does not
qualify.

1. **Execution floor** — passes the canon as an *evaluation*, not a vibe:
   Nielsen's 10 heuristics; Norman's affordance/signifier/mapping/feedback/
   conceptual-model; the quantified interaction-cost laws (Fitts, Hick, Miller,
   Doherty `<400ms`, Tesler); Gestalt grouping; Rams'/Tufte's/Few's restraint;
   and **WCAG 2.2 AA** as a hard, testable gate. This is ~60–70% of every award
   rubric — and only the *floor*.
2. **A genuine idea** — does something a template-and-spreadsheet workflow or a
   generic configurable CRM cannot. This is ~30–40% of every award rubric
   (D&AD's "a good idea, well executed"; Fast Company's depth-of-user-insight).
   Execution cannot rescue a derivative idea.
3. **Named human context** — you can state the specific operator role and job in
   one sentence (Cooper/Goodwin). Per ISO 9241-210, "shipped but never walked
   through as the real user" is an incomplete *process*, not a finished screen.

**Parity is "good," not "great."** Matching Attio/Linear/Stripe/Fantastical is
the *good* tier. Great requires the category-defining move in §5.

## 2. The ambition ladder — locate every surface honestly

**bolt-on → good → great → category-defining.** Name where a surface actually
sits; do not oversell. "Adopted the kit + a KPI strip on an unchanged surface"
is **bolt-on** — full stop.

| Archetype | bolt-on (reject) | good (parity) | great | **category-defining (the target)** |
|---|---|---|---|---|
| **Record Cockpit** (Client) | Schema-order fields behind tabs; detail pane can render blank | True master-detail, never-blank, highlights panel of 4–6 decision fields, related-list cards, filterable activity timeline | Attio/Linear/Superhuman: cockpit-wide `Cmd+K` as primary navigation with self-teaching shortcut hints; inline-edit-with-instant-feedback; transparent auto-activity; multi-select + bulk as base | **Role-aware cockpit that surfaces booking risk inline** — weather/logistics exposure for outdoor events, crew/equipment conflicts, and deposit→final lifecycle state, none of which a horizontal CRM has |
| **Scheduling / Calendar** | Static grid; click-day opens a multi-field modal | Google Calendar parity: view-switching, color-per-kind, drag to create/reschedule, conflict flags | Notion Calendar/Fantastical/Motion/Amie: one command-bar for NL "go to date" + NL event creation; number-key density; drag an unscheduled task onto a slot | **Drive-time-aware auto-placement for a mobile vendor** — suggests slots from priority/duration *and travel between gigs*, with a field-usable **offline/day-of-event mode** |
| **Dashboard / Queue** (Today) | KPI cards mirroring every schema metric, no ranking, dead-end numbers | One hero number answering the surface's #1 question, trend, muted-except-actionable | Stripe-grade: answers "what do I do now" in <3s, every KPI one click from the actionable record, surfaces about-to-be-urgent before it's overdue | **Cash-flow-runway-to-next-booked-job view** — not just current state, but "can I make payroll before the next deposit lands," a number only *this* vertical needs |
| **Money / AR** (Invoices) | Flat table; red applied loosely to drafts/not-yet-due | Hero AR-outstanding + trend; tabular numerals; red reserved for overdue-actionable; aged buckets (current/1–30/31–60/61–90/90+) | Mercury/Ramp: hierarchy-first flow (Ramp's own 2024 redesign: **33% faster reviews, 50% faster repayments**); one click from an aging bucket to the collection action; bulk reminders + palette triage | **Deposit-to-event-date AR** tied to the booking lifecycle, plus a **client-facing invoice/PDF that visibly out-classes HoneyBook** — the anti-take-rate, no-bloat brand touchpoint |

## 3. The critic-lens panel

Run at **spec time** (push ambition up before building) and again at **review**
(catch where it fell). With a subagent fleet, run the lenses as parallel
adversarial critics. Each lens grades against an **external** rubric and carries
a **ratchet-up question** — the job is to find what's missing, not to award a
pass.

| Lens | Grades against | Ratchet-up question |
|---|---|---|
| **Job / goal-directed** | Cooper *About Face*; Goodwin role/workflow models | Which of our roles (owner / field tech / subcontractor) is this silently conflating into one "user"? |
| **Nielsen heuristics** | NN/g's 10, scored individually with evidence | What would a formal NN/g eval flag as moderate-or-worse that we waved past? |
| **Interaction cost** | NN/g formula + Fitts/Hick/Miller/Doherty/Tesler | What would a command-palette-first product *remove entirely* from this flow? |
| **Named-exemplar parity** | The specific leader for this surface (§6) | Name the exact capability the exemplar has that we lack — that's the next increment, not "someday." |
| **Craft / restraint** | Rams, Tufte, Few, Ive "inevitability" | What would Rams cut? What would Ive call "merely minimal" vs "inevitable"? |
| **Anticipation** | Tesler; Shapiro anticipatory design; Motion/Clay | What could the system infer from data it already has that it still asks the operator for? |

### Numeric budgets (demonstrate the rigor, don't just name the laws)
Worked examples on our two highest-frequency flows — these are the standard, not
illustrations:
- **Create-invoice-from-a-pipeline-win**: target ≤ 3 inputs (the win already
  carries client + amount + event); everything else pre-filled and inspectable.
- **Collect-on-an-overdue-invoice**: aging bucket → specific invoice → send
  reminder in **≤ 2 clicks**; bulk reminder for a whole bucket in one.
- **Command palette / nav**: ≤ **7±2** results above the fold (Miller).
- **Every inline edit**: round-trips in **< 400ms** (Doherty) or shows
  optimistic UI. Perceived-instant is a Linear-grade craft gate, not a nicety.

## 4. Cross-validation matrix (market ⟷ canon — the bullshit filter)

Every pattern we adopt must trace to **both** a canonical principle **and** a
market exemplar. A pattern tied to no principle is fashion (flag, don't adopt);
a principle in no current exemplar gets pressure-tested. Verdicts:
**bedrock** (canon + market agree) · **reconciled tension** (a leader breaks a
rule on purpose — rule on it for *our* users) · **novel extension** (market
predates the canon — name it as newer).

| Pattern | Canonical principle | Exemplar | Verdict |
|---|---|---|---|
| Never-blank zero-state; empty = onboarding | Nielsen #1 (status), #8 (minimalist) | Attio, Notion, Linear | **bedrock** |
| Collapsible / focus panes; user reclaims space | Nielsen #3 (control & freedom), #7 (flexibility) | Linear, Superhuman | **bedrock** |
| Red reserved for overdue-and-actionable only | Norman (feedback/mapping); Gestalt figure-ground | Mercury, Ramp | **bedrock** |
| `Cmd+K` command palette as primary nav | Recognition-over-recall (#6) *tension* vs efficiency (#7) | Linear, Superhuman | **reconciled tension** — power surface for daily operators; discoverable fallbacks stay for novices |
| Dense keyboard-first list | Fights #6 for novices, wins #7 for experts | Superhuman | **reconciled tension** — gate on cardinality (n:many only) |
| Anticipatory auto-placement / auto-fill | Tesler (system absorbs complexity) | Motion, Clay | **novel extension** — canon predates it; logic must stay inspectable |
| NL single-line event/invoice creation | Hick (fewer choices), interaction cost | Fantastical | **novel extension** |

## 5. The category-defining tier (the anti-throttle heart)

Our own research **throttled down here** — it defined "great" as adopting what
Linear/Fantastical/Mercury already ship (parity dressed as greatness) and never
proposed one mechanism specific to **booked-job / mobile-beverage / catering**
businesses. That is the failure to break. Exemplar parity is the *good* tier;
**great requires a mechanism a horizontal product structurally cannot have**,
drawn from our vertical's real conditions:

- **Weather/logistics-risk on the record and calendar** — outdoor events carry
  contingency the operator must see inline, not compute in their head.
- **Deposit → final-payment lifecycle tied to the event date** — AR that knows a
  booking's payment schedule, not just generic aging.
- **Cash-flow runway to the next booked job** — "can I cover costs before the
  next deposit lands," a number only this vertical needs.
- **Drive-time-aware scheduling** between gigs for a mobile vendor.
- **Day-of-event / field mode** that works **offline** (the anchor customer runs
  weekly outdoor drops in exactly the conditions where connectivity fails —
  Ink & Switch local-first).
- **A client-facing invoice/proposal artifact** that visibly out-classes
  HoneyBook's templated, take-rate feel — the highest-stakes brand touchpoint.

**If a flagship spec cannot name its category-defining mechanism, it is not
done.** Say so — do not relabel it "competent."

## 6. The named exemplar bar (and the competitor we're beating)

Per surface, the product that *is* the ceiling. "Would this ship there? what
does it have that we lack?" is a concrete test.

- **Record cockpit** → Attio (relational, spreadsheet-fast), Linear
  (palette-as-product), Superhuman (self-teaching `Cmd+K`), Salesforce Lightning
  (highlights + related-list anatomy), HubSpot (three-pane record), Folk (<3s
  load), Notion (empty-state doctrine), Clay (transparent enrichment).
- **Scheduling** → Notion Calendar (NL command bar), Fantastical (single-line
  parse — two-time Apple Design Award winner), Motion (auto-placement), Amie
  (task→slot drag). Google Calendar is the *floor*, not the ceiling.
- **Dashboard/queue** → Stripe Dashboard (3-second answer); Stephen Few for
  KPI/dashboard discipline specifically.
- **Money/AR** → Stripe, Mercury (hierarchy-first, tabular numerals, color
  discipline), Ramp (measured speed gains), QuickBooks AR Aging (bucketing);
  Baymard Institute for the payment/form flows.
- **Competitor to beat, by name: HoneyBook** — audit it directly. Its templated
  feel, bloat, and take-rate friction are the specific things our cockpit and
  AR/invoice UI must *visibly* do better. Our anti-HoneyBook, subscription-only,
  no-take-rate positioning is a **Differentiation-tier design decision** (iF
  gives Differentiation equal weight), not a pricing-page footnote.

## 7. Cardinality — the right pattern flips on `n`

When a pattern is declared great, judge it **from the end user's experience**
and tag its **cardinality regime**. The right pattern *inverts* on how many of a
thing the user faces:

- **n:many** (client → many invoices over a season; pipeline → many opps; a busy
  caterer's day → many events): dense, filterable, sortable list; search; **bulk
  actions**; honest density. Cards *collapse* here.
- **n:few** (client → 2–3 contacts; a solo cart's day → one event): rich inline
  cards, direct manipulation, whitespace. A dense table here is over-engineering.
- **The best patterns scale across the whole spectrum** — empty(0) → one → few →
  many → too-many — degrading from cards into a list as `n` grows.

**Per-surface cardinality profile (write it down so the pattern is *derived*,
not guessed):** client→invoices = n:many (busy season) → needs list+filter+bulk;
client→contacts = n:few → inline cards; calendar day→events = varies by business
→ must scale; pipeline→opportunities = n:many → board/list + bulk. **Never import
a pattern whose regime doesn't match the surface's.**

## 8. Hard gates (numeric, non-negotiable, block merge)

- **WCAG 2.2 AA**: 4.5:1 body text · 3:1 large text / UI components · target size
  ≥ 24×24px (≥ 44×44pt for field/touch). **Re-check on the Signal palette lock —
  a palette change is exactly when contrast regressions slip in silently.**
- **Dark mode** and **`prefers-reduced-motion`** — table stakes (every named
  exemplar ships both by default), not stretch goals. *(NB: the admin shell's
  hardcoded `bg-gray-50` currently breaks dark mode app-wide — a real gate, not
  cosmetic.)*
- **Latency**: optimistic UI / `<100ms` feedback, held to the same seriousness
  as accessibility when the bar is a Linear-grade exemplar.
- **No blank empty states** — every `n=0` renders one specific next action.
- **Bulk / multi-select** on every list view at build time, not v2.
- **Keyboard + `Cmd+K`** operability for any surface touched dozens of times a
  day (cockpit, AR, pipeline, calendar), in the same increment as the surface.
- **Offline / local-first** wherever the real user works in the field.
- **The client-facing artifact** (emailed PDF invoice, public proposal/page)
  passes the same craft bar as the in-app screen.

## 9. Anti-throttle rules

- **No "competent, not great" escape hatch on a flagship surface.** Failing gate
  2 (idea) or 3 (human context) **blocks merge** — it is not a label. This is
  the escape valve our own research reached for; it is closed.
- **No schema-order block-stack layouts, ever** (Cooper goal-directed + Nielsen
  #8). Build from the operator's goal, not the Firestore field list.
- **No module "shipped" without the authenticated browser walkthrough** (ISO
  9241-210 evaluation-against-real-use). This has been repeatedly owed and
  deferred — that deferral *is* the anti-pattern.
- **Red/alert color is reserved for genuinely actionable-now states** — audit
  every color-token PR against this during the Signal sweep.
- **Outcome claims need a number or a user-insight artifact** (before/after),
  from a **primary source** — "looks cleaner" and restated marketing are not
  evidence.
- **Audit the competitor by name** (HoneyBook) with concrete weaknesses we beat.
- **Keep the pre-build spec** (`docs/superpowers/specs/*`) — it is the
  human-context research trail that separates award-tier from generic-competent
  work. Skipping it under time pressure is the tell.

## 10. How it plugs into the build process

1. **Frame-first spec gate (before any fleet, ~10 min):** open every level-up
   with a before/after **layout skeleton** + a one-line dominant-surface verdict
   ("restructuring the hero into Y" / "keeping it because ___" as an explicit,
   signed-off choice — never a default) + the **cardinality profile** + the
   **category-defining mechanism**. A timid scope dies here, not after 3h.
2. **Ambition is never cost-tiered.** No "near-free tier." Cost is decided
   *after* the design, never used to cap it.
3. **The critic-lens panel runs at spec and at review.** A lens can demand more
   ambition; none can lower the bar. On flagship surfaces, gates 2 and 3 block
   merge.
4. **Match rigor to ambition** — a bold rebuild earns the full mutation-tested
   review; don't burn it over-verifying a bolt-on that should have been rejected
   at step 1.

---

## References

Canon & process: Nielsen's 10 Heuristics (nngroup.com) · Laws of UX
(lawsofux.com) · Norman, *The Design of Everyday Things* / *Emotional Design* ·
Rams' 10 Principles · Maeda, *Laws of Simplicity* · Tufte / Stephen Few
(dashboards) · Cooper *About Face* / Goodwin *Designing for the Digital Age* ·
Shneiderman's 8 Golden Rules · Gestalt · Baymard Institute · Luke Wroblewski
*Web Form Design* · IBM Carbon / Atlassian / Polaris (dense B2B) · Ink & Switch
*Local-first software* · ISO 9241-210 · WCAG 2.2.
Award rubrics: Apple Design Awards · Awwwards (Design 40 / Usability 30 /
Creativity / Content) · D&AD · iF · Red Dot · Fast Company Innovation by Design ·
UX Design Awards · IxDA · Webby · Core77.
Exemplars: Attio · Linear · Superhuman · Salesforce Lightning · HubSpot · Folk ·
Clay · Notion Calendar · Fantastical · Motion · Amie · Stripe · Mercury · Ramp ·
QuickBooks AR Aging. Competitor audited: HoneyBook.

*Reusable methodology: the `design-ambition` skill. Related: the module-levelup
playbook, `docs/ROADMAP.md`.*
