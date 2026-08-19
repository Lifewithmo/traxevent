# The Customer Proposal Document — design-ambition pass

Date: 2026-08-18 · Surface: `/proposals/[token]` (+ `/print`) · Status: **spec, not approved**

Run under the `design-ambition` gate. Scope is the **customer-facing** document only —
the operator builder is out of scope except where the two must stay WYSIWYG-locked.

---

## §0 Verdict up front

**Ladder placement: low end of `good`.** Not bolt-on — it is careful, honest about its
numbers, shares pricing primitives with print so the two cannot drift, and handles
signed/declined/voided/expired states deliberately. But it is a **form wearing the
client's logo**, not a document.

**It fails gate 2 (a genuine idea).** There is nothing here a generic tool in the
category cannot do; it is a strictly weaker Jobber quote page. Per the gate, that
**blocks merge** on a flagship surface — and this is the single highest-stakes brand
touchpoint in the product, the only screen a paying customer ever sees.

It also fails three **hard gates** outright (§5): WCAG 2.2 AA target size on the upsell
control, AA contrast on the expiry line and the branded hero, and "the client-facing
artifact passes the same craft bar" — there is **no PDF at all** (§5.7).

---

## §1 Job, roles, cardinality

**Job-to-be-done (one sentence):** *A client who asked for a cart at their event opens a
link on their phone, understands exactly what they're getting and what it costs, and
commits money — without a phone call.*

**Roles — these are not one user:**

| Role | Their real question | Served today? |
|---|---|---|
| **The decider** (bride, HR/office manager, brewery owner) | "Is this the right thing, and can I picture it?" | Barely — prose blocks + tier bullets |
| **The approver** (their boss, their partner, finance) | "What am I signing off on, and why this number?" | No — no forwardable summary, no share affordance, no per-stakeholder view |
| **The skeptic** | "Have they done this before? Will they show up?" | Weakly — one optional testimonial block type |

Today's page silently conflates all three into "signer". The approver is the one who
kills deals, and the document does not address them at all.

**Cardinality profile:**
- Packages: **n:few** (1–3 tiers) → rich cards. Correct pattern chosen.
- Optional add-ons: **n:few→many** (2–15) → today a flat checkbox list with no grouping,
  no images, no "most clients add this". Degrades badly past ~8.
- Blocks: **n:many** (unbounded) → today an undifferentiated vertical run of 5 block
  types with no sectioning, no full-bleed, no navigation. Fails at length.
- **n=0 states:** a proposal with no packages and no add-ons renders as bare prose +
  a totals bar. Not a void, but not designed either.

---

## §2 The market bar for THIS surface (researched 2026-08-18)

Named exemplars, judged by walking the client's job through them — not by press:

- **Qwilr** — the parity test for *presentation*. Proposals open as an interactive web
  page, not a document: mobile-responsive by construction, embedded video (Loom/YouTube/
  Vimeo), an interactive **Quote Block** carrying plans/packages, a separate **Accept
  Block** combining e-sign + payment, and interactive calculators the client manipulates.
- **PandaDoc** — the parity test for *breadth*: proposal + contract + e-sign + payment +
  CRM in one, at a lower entry price.
- **Jobber** — the parity test for *our actual vertical*. Client Hub: mobile-friendly
  quote approval with signature, **optional line items the client self-selects**, **line-item
  images**, deposit payment at approval time, and a **"request changes"** path back to the
  operator.
- **Proposify / Better Proposals / GetAccept** — the analytics floor: open notification,
  per-section dwell time, and whether the client **forwarded it internally**.

**What every one of them has that we lack, named specifically:**
1. Line-item **images** (Jobber) — the add-on list is where money is made and ours is text.
2. **Request changes** (Jobber) — our only non-accept path is a bare "Decline" that
   captures nothing.
3. **Video** (Qwilr) — the cheapest trust signal for a one-person mobile business.
4. A real **PDF** (all of them) — ours is a link labelled "Download PDF" that opens HTML.
5. **Per-section engagement + forward detection** (all of them) — we stamp one open per hour.

Parity with this list is the **`good`** tier. It is where research naturally stops and it
is not enough (§6).

---

## §3 Canon × market cross-validation (the bullshit filter)

| Market pattern | Canonical principle | Verdict |
|---|---|---|
| Interactive page, not PDF (Qwilr) | Norman: conceptual model matches the medium the client is actually in (a phone, a link) | **Bedrock** — adopt |
| Optional line items self-selected (Jobber) | Shneiderman: user in control; Tesler: the system absorbs the pricing math | **Bedrock** — we have it; the *execution* fails (§5.5) |
| Line-item images (Jobber) | Norman: signifiers; aesthetic-usability effect | **Bedrock** — adopt |
| Tiered good-better-best | Hick's Law says fewer choices are faster — 3 tiers deliberately *adds* choice | **Reconciled tension** — 3 is the documented sweet spot; cap at 3, mark one recommended (we do). Keep. |
| Embedded video | Predates no canon; newer than the foundation | **Novel extension** — name it as such, justify per-vertical (trust for a solo operator) |
| ROI calculators (Qwilr) | Tesler: absorb complexity; inspectable logic not a black box | **Bedrock in principle, fashion in B2B-SaaS practice** — a generic ROI slider would be fashion here. Our domain-true version is §6. |
| Countdown/urgency timers | Peak-end + scarcity — but usually **fabricated** | **Flag** — adopt ONLY where the scarcity is real. Ours can be (§6b); a fake one would be a dark pattern. |
| Per-section dwell analytics | No canonical basis; it serves the *seller*, not the client | **Fashion, seller-side** — adopt for the operator surface (a different increment), never as a reason to degrade the client's page |

---

## §4 Critic-lens panel

**1. Job / goal-directed (Cooper, Goodwin).** The page is ordered by *schema*: packages →
line items → optional items → notes → terms → sign. Not by the client's decision flow
(*picture it → trust it → price it → commit*). Terms and Notes — the two lowest-value
blocks — sit directly above the signature, the highest-value moment.
→ *Ratchet:* it silently conflates decider/approver/skeptic. **The approver has no artifact.**

**2. Nielsen heuristics.** Worse-than-moderate findings:
- **#2 Match with the real world** — "Download PDF" produces no PDF (`ProposalResponseClient.tsx:252`).
- **#6 Recognition over recall** — on mobile the running total lives in a sticky bar that
  is visually detached from the tier cards the client is comparing.
- **#1 Visibility of status** — expiry is `text-gray-400` microcopy; the client cannot tell
  a proposal is about to die.
- **#8 Aesthetic and minimalist design** — seven stacked `<Card>` shells with `<CardTitle>`
  headers are admin chrome, carrying zero signal on a client document.
→ *Ratchet:* a formal NN/g eval would also flag error prevention — a bare "Decline" with
no confirm and no reason is irreversible and information-free.

**3. Interaction cost.** Worked example, highest-frequency flow — *client opens emailed
link on a phone, picks a tier, adds one add-on, signs, pays deposit*:

| | Today (measured from source) | Budget |
|---|---|---|
| Scroll gestures | ~6 (hero `py-16`, blocks, 5 cards, sticky bar) | ≤3 |
| Taps | 9 | ≤5 |
| Typed fields | 2 (name, email) — both already known to us from the lead | 0–1 |
| Smallest target | **16px** (`h-4 w-4` add-on + consent checkboxes) | ≥44pt |
| Price visible while choosing | Only in a sticky bar competing with the CTA at 375px | Always, adjacent |

→ *Ratchet:* a command-palette-first product would **remove** the name/email fields
entirely — the link is tokenized and the lead record already carries both. Pre-fill and
let the client correct, per Tesler.

**4. Named-exemplar parity.** Fails Jobber (line-item images, request-changes, real PDF);
not close to Qwilr (single-column `max-w-3xl` on `bg-gray-50`, five block types, no video,
no full-bleed, no sectioning).
→ *Ratchet — the exact next increment, not "someday":* **line-item images + request-changes.**

**5. Craft / restraint (Rams, Tufte).** What Rams would cut: every `CardHeader`/`CardTitle`
on this page. "Choose an option", "What's included", "Optional add-ons", "Notes", "Terms",
"Sign to accept" — six labels announcing what the content already shows, each wrapped in a
bordered box. That is data-ink spent on chrome. The document should read as **paper**, and
the app kit should not appear on it at all.

**6. Anticipation / complexity absorption (Tesler, Shapiro).** Everything the system
already knows and still asks for or omits: the signer's **name and email** (on the lead);
the **event date** (on the opportunity — never shown on the document); **what happens after
you sign** (nothing is said); **whether we can still do the date** (capacity now exists).
→ *Ratchet:* the client's real question — *"what will this actually look like on the day?"* —
is answered by prose the operator had to type.

---

## §5 Hard-gate failures (evidence, must fix in increment 1)

| # | Gate | Evidence | Severity |
|---|---|---|---|
| 5.1 | **WCAG 2.2 AA target size (≥24px; ≥44pt touch)** | `ProposalPricing.tsx` add-on checkbox `className="h-4 w-4"`; consent checkbox `h-4 w-4` in `ProposalResponseClient.tsx` | **Blocker** — 16px, on the upsell control and the consent gate |
| 5.2 | **AA contrast 4.5:1** | `text-gray-400` (#9ca3af ≈ **2.5:1** on white) on the expiry line, `ProposalPricing.tsx` `ProposalTotals` | **Blocker** |
| 5.3 | **AA contrast, unbounded** | Hero: `text-white/80` over `bg-black/40` over an **arbitrary customer-uploaded** `cover_image_url`. **VERIFIED 2026-08-18: worst case 2.85:1 title / ≈2.4:1 subtitle** — fails AA *and* the 3:1 large-text floor on any bright cover. Fix is arithmetic, see §12 | **Blocker, confirmed** |
| 5.4 | **Client-facing artifact craft parity** | No PDF library in `package.json`; "Download PDF" links to an HTML print page | **Blocker** |
| 5.5 | **Mobile (375) / tablet (768)** | Never walked. Sticky bar is `flex-wrap items-end justify-between` holding a 2xl price + 2 sub-lines + 2 buttons; tiers are `sm:grid-cols-3` (3-across from 640px) | **Blocker** — per the standing walkthrough rule |
| 5.6 | **No blank empty state** | n=0 packages + n=0 add-ons renders prose + a totals bar with no next action beyond the sticky CTA | Important |
| 5.7 | **Dark mode / reduced-motion** | N/A by design — this is fixed-white paper (see `proposal-paper-never-inverts`). **Do not "fix" this.** | Documented exemption |

Two structural notes, not gates:
- **Block-stack violation.** The page is a schema-ordered stack of seven `<Card>`s — the
  exact failure the standing `design-no-block-stacks` rule forbids, on the surface where
  it matters most.
- **Composition still duplicated.** `ProposalPricing` was extracted because web and print
  drifted; the *page-level composition* is still written twice
  (`ProposalResponseClient.tsx` and `print/page.tsx`) and kept in sync by discipline.

---

## §6A Winning document polish outright (not conceding it)

An earlier draft of this spec said Qwilr "will always out-design us on document polish."
That is the throttle-down this gate exists to block: conceding a dimension instead of
asking what we build to lead it. Struck. Polish is a **target**, and it is winnable.

**The asymmetry.** Qwilr's polish is a *capability offered*; ours can be a *guarantee
delivered*. A horizontal page builder hands the operator a blank canvas and hopes they are
a designer — so its real floor is whatever a solo operator with no design training produces
at 11pm the night before. A horizontal tool **cannot art-direct content it does not
understand**. We are vertical: we know every content type a beverage-service proposal
contains — cover, story, menu, day-plan, gear, team, gallery, tiers, terms — so every
layout can be designed in advance and **nothing is left to operator taste**.

They win on ceiling-if-you-happen-to-be-a-designer. We win on **every document, every
time.** That is the stronger position, and it is the one an award rubric grades.

**What we build to get there:**

1. **An editorial layout engine, not a block list.** Replace the five generic blocks
   (heading/paragraph/list/image/testimonial) with **named section archetypes**, each with a
   designed layout for every content cardinality (1 item / 3 / 12) and every viewport.
   Polish becomes deterministic output, not operator effort.
2. **Real typographic craft.** Modular scale, controlled measure (65–75ch), optical sizing,
   true vertical rhythm, tabular figures on money, hanging punctuation, proper widow/orphan
   control in both screen and print. This is *learnable and cheap* — Bringhurst and
   Müller-Brockmann are settled canon — and almost no SaaS proposal tool does any of it.
   It is the single largest perceived-quality delta per unit of effort available to us.
3. **Brand-adaptive art direction. — REVISED by Decision 4b (2026-08-18).**
   *Original position:* the org supplies a logo and one accent and never picks a font,
   because choice is where polish dies.
   *Decided:* **orgs choose fonts freely.** Proceeding as directed. The honest consequence:
   the promise weakens from "every document is well-typeset" to "every document is
   well-typeset **given the operator's typeface**", and a genuinely bad font choice can
   still produce a document we would not want to show. The gate cannot police taste.

   **What we therefore control instead — this is now load-bearing, not optional:**
   - **The type scale, not the typeface.** Modular scale, sizes, weights, line-height,
     measure and rhythm are all ours; the org supplies a family only.
   - **Weight validation at selection time.** Reject/warn on a family lacking the weights the
     archetypes need — a single-weight display face breaks every hierarchy we designed.
   - **Rendering validation.** Confirm the face actually loads and covers the needed glyph
     range; fall back to our default rather than shipping tofu.
   - **A strong, tasteful default** that most orgs keep. Free choice is not free adoption.
   - **PDF consequence — decisive:** arbitrary org fonts must embed in the PDF. A headless-
     Chromium renderer fetches them as ordinary webfonts and just works; a JS PDF renderer
     would need per-org font registration and TTF/OTF parsing. **Decision 4b independently
     strengthens the §14 recommendation.**
4. **Photography as a typed system.** Because we know the vertical, images carry *roles*
   (cover / menu item / gear / team / gallery) with enforced aspect ratios, art-directed
   crops, and quality floors — not "insert image block, good luck."
5. **A designed reading experience.** Considered scroll pacing and entrance treatment,
   `prefers-reduced-motion` respected as a first-class path, not an afterthought.
6. **A polish gate in the product.** A document cannot be sent if it fails contrast,
   measure, image-resolution, or empty-section checks. **No operator can ship an ugly
   proposal.** No horizontal tool can make that promise, because it cannot judge content
   it does not model.
7. **The PDF as a designed artifact** — real typographic output, not a screenshot of a
   web page.

**What we have to learn to do it:** encode the editorial/typographic canon (Bringhurst,
Müller-Brockmann grid systems, Tufte on data-ink) and the award rubrics' own definition of
craft (Awwwards Design 40, Apple Design Awards) into the archetypes **once**. That is a
research-and-design investment, not an ongoing tax — and it compounds across every document
the platform will ever send.

**Measurable target, so this is not a vibe:** blind-rank our generated document against a
Qwilr and a PandaDoc template of the same brief, judged by an external rubric. We are not
done until we win that comparison on design quality — not "hold our own".

---

## §6 The category-defining move

Polish (§6A) gets us to the top of the category. This is what puts us in a category of one:
PandaDoc and Qwilr do not know what a shift is. **We do.**

> **The proposal is a simulation of their event, not a description of it.**

Three composing mechanisms, all domain-true:

**(a) The client's day, rendered.** Not three tiers of text bullets — an actual timeline
of *their* event (arrive 3:00 · serving 4:00–7:00 · breakdown 7:30), the real drink menu
from the catalog with product names and photos, and the headcount→consumption math shown
honestly ("150 guests × 1.8 drinks ≈ 270 servings — 2 carts, 3 baristas"). PandaDoc cannot
render this because it has no concept of a shift, a cart, or a serving rate.

**(b) A real date hold with a real countdown.** *"We're holding Sat Oct 12 for you until
Friday."* Honest scarcity, backed by actual capacity — which is the difference between
this and the fake urgency timers the canon rightly flags as a dark pattern (§3). Also the
single highest-leverage conversion mechanism available to us.

**(c) A headcount control that re-prices live.** The client's real uncertainty in this
vertical is *"how many people are coming."* Qwilr's ROI calculator is the horizontal
analogue; ours is domain-true and inspectable — move headcount 100→150 and servings, carts,
staff and price all move, with the arithmetic shown, never a black box (Tesler).

Together these also solve the **approver** problem: (a) and (c) produce something
forwardable that answers "why this number" without the operator on the phone.

---

## §7 Increments, with feasibility status

**Claims below are marked VERIFIED (checked against the code today) or HYPOTHESIS (needs an
independent skeptic before it drives a decision).** Per the gate, no S/M/L estimate here is
load-bearing until refuted-or-confirmed.

### Increment 1 — Make it a document, and win on craft (buildable now, no new data)
Clears every §5 blocker, the §4 craft/ordering findings, and lands §6A items 1–3, 5, 7.
This increment is where the polish lead is won or lost — it is not a cleanup pass.
- Retire the app `Card` kit from the client page. Build the **editorial layout engine**
  (§6A.1): named section archetypes with designed layouts per cardinality and viewport,
  one shared page-level composition serving web **and** print (kills the last duplication).
- Land the **typographic system** (§6A.2) and **brand-adaptive art direction** (§6A.3) —
  derived palette, scrim and type pairing, contrast-guaranteed, no operator font choice.
- Re-order to the decision flow: picture → trust → choose → price → commit. Terms and
  Notes move below the signature, not above it.
- Fix 5.1–5.3: 44pt targets, AA ink, and a **contrast-guaranteed hero** (measured overlay
  or a clamped scrim, not a fixed `black/40`).
- Real **PDF** (5.4), so "Download PDF" stops lying. *HYPOTHESIS: no PDF dependency exists;
  route choice (serverless Chromium vs. a React PDF renderer) is unpriced — verify against
  the Vercel function limits before committing.*
- Pre-fill signer name/email from the lead (§4.6); reduce the flow to the §4.3 budget.
- Mobile-first: 375 / 768 / desktop walked before merge, per the standing rule.
- **Peak-end:** replace the "Signed" card with a real end state — what happens now, when
  we arrive, add-to-calendar, receipt.

### Increment 2 — Jobber parity (small data additions)
- **Line-item images** on add-ons. *VERIFIED: `ProposalLineItem` (lib/types.ts:532) has no
  image field and no `catalog_ref` — this is an additive schema change plus an upload path.
  The existing tokenized-upload pattern applies (`lib/uploads.ts`).*
- **Request changes** — a third path beside Accept/Decline that captures what they want,
  logs an activity, and notifies the operator. Replaces the information-free "Decline".
- Decline reason capture.

### Increment 3 — The simulation (§6a, §6c)
- **VERIFIED BLOCKER:** `ProposalLineItem` carries **no `catalog_ref`**. The only
  `catalog_ref` in the repo is on `Product` (lib/types.ts:796), a dormant drops seam. The
  proposals↔catalog link is a **queued, unbuilt** increment. §6a and §6c cannot be built
  until it lands — this is a hard dependency, not a risk.
- *HYPOTHESIS: the consumption math (headcount → servings → carts → staff) exists in
  `lib/ops/derive.ts` / `catalog-costing.ts` in reusable form. Must be verified; if it
  doesn't, §6c is a bigger build than it looks.*

### Increment 4 — The date hold (§6b)
- **VERIFIED:** capacity is real and on `origin/main` — `lib/capacity/`, `actions/capacity.ts`,
  `app/(admin)/[orgSlug]/capacity/page.tsx`. **Not on the current branch** (`brewtrax-marketing-inc1`
  is behind main).
- *HYPOTHESIS: capacity is tier-gated to the business plan (per the resource-capacity work).
  If so, a client-facing hold inherits a product question — does a Starter org get a hold?
  Answer before speccing the mechanism.*

---

## §8 Build hygiene (if approved)

- **Start from a fresh worktree off `origin/main`.** The current branch is a marketing
  branch and is behind main (missing `lib/capacity/`). The primary checkout is contended by
  concurrent sessions — do not build here.
- Never regenerate `__tests__/fixtures/proposal-signature-goldens.json`.
- The canvas/document is **permanently white paper** — semantic tokens are the bug here.
- Money on the paper stays `toFixed(2)` across builder, public, print, and the send dialog.
- `next build` must run before calling the branch green (`'use server'` type re-export trap).

---

## §9 DECISIONS (user, 2026-08-18)

1. **Video — BOTH, loop first.** Increment 1 ships the **ambient silent loop** (6–10s of the
   cart alive behind the headline, muted, 1–3MB) — it fits the *existing* upload path with
   only a MIME tweak, involves no third party, has no player chrome, and is fully ours.
   Increment 2 adds the **pitch-video facade** (§13) once we know operators actually have
   videos. Both are art-directed archetypes, never generic embeds.
2. **Date hold — EVERY TIER.** The hold is not a paid upsell. Constraint this creates: the
   mechanism cannot depend on plan-gated capacity features. Increment 4 must either read
   capacity ungated or degrade to a plain date-conflict check on lower plans. Decide when
   speccing increment 4.
3. **Ship increments 1 & 2 now.** The catalog needs rebuilding regardless, so the
   simulation layer (§6a/§6c) waits for the proposals↔catalog link rather than blocking
   the craft work.
4. **PDF — TYPST, as a deliberately print-native artifact** (revised 2026-08-18 after
   verification; supersedes the initial "serverless Chromium" lean). The PDF is not the web
   page on paper — it is a superior printed piece: Knuth–Plass justification, real
   hyphenation, running heads, PDF/UA accessibility. See §14.
4b. **Fonts — ORGS CHOOSE FREELY.** Reverses my §6A.3 recommendation; recorded with its
   consequence stated (see §6A.3-REVISED). The guarantee changes from *guaranteed* to
   *guarded*: we no longer control the typeface, so we must control everything around it.
5. **The polish gate — YES. "No ugly proposals."** The send path refuses a document that
   fails the craft checks, with an override that names exactly what is wrong.
6. **Blind-rank benchmark — folded into increment 1's definition of done** (not separately
   answered). It is the gate's own evidence requirement: "we lead on polish" is a claim
   until an external rubric says so. Cut it if you want the time back.

---

## §10 The section archetype system (§6A.1)

**The core move:** the operator stops assembling generic blocks and starts filling *named
sections we have already designed*. Every archetype has a designed layout for each content
cardinality (0 / 1 / few / many) and each viewport (375 / 768 / desktop). Polish stops
being operator effort and becomes deterministic output.

**Archetypes**, ordered by the client's decision flow — *picture it → trust it → choose →
price → commit* — which is deliberately NOT today's schema order:

| # | Archetype | Serves | Notes |
|---|---|---|---|
| 1 | `cover` | decider | Full-bleed. Brand, title, client name, **their event date**. Contrast-guaranteed scrim (§5.3). |
| 2 | `letter` | decider | Short personal note. Measure-controlled prose, the only free-text-heavy section. |
| 3 | `video` | skeptic | The operator's promo. Art-directed poster, our chrome. **Decision 1.** |
| 4 | `gallery` | skeptic | Past events. Typed image roles, enforced crops (§6A.4). |
| 5 | `team` | skeptic | Who actually shows up. The trust section a horizontal tool has no concept of. |
| 6 | `testimonial` | skeptic | Exists today; gets a designed treatment. |
| 7 | `menu` | decider | **The vertical's signature section.** What they'll be served. Placeholder-authored now; catalog-driven after the rebuild. |
| 8 | `day_plan` | decider + approver | Timeline of *their* day. Operator-authored now; derived later (§6a). |
| 9 | `logistics` | approver | What we need from you — power, space, access. Competence signal; also deflects the #1 day-of failure. |
| 10 | `tiers` | decider | The choice. Cap 3, one recommended (§3). |
| 11 | `add_ons` | decider | **With images** — increment 2. Money surface; 44pt targets (§5.1). |
| 12 | `investment` | approver | Totals, deposit, expiry — expiry with real prominence, not gray-400 microcopy. |
| 13 | `accept` | signer | Signature + payment. Pre-filled from the lead (§4.6). |
| 14 | `terms` | approver | **Below `accept`**, not above it. |

`prose` remains as an escape hatch (the existing blocks, measure-controlled) so no proposal
becomes unauthorable — but it is the exception, not the substrate.

### §10.1 Legacy migration — the hard constraint

Every proposal already sent must keep rendering, and **signed proposals are hash-covered
and immutable**. So:

- Add a `ProposalSection` layer *above* the existing `ProposalBlock` union rather than
  replacing it. Sections carry an archetype + layout; blocks remain the content primitive
  inside `prose`, `letter`, `logistics`.
- A legacy proposal with only `blocks` maps to **one implicit `prose` section** — it renders
  at least as well as today with zero migration and zero write on open.
- This mirrors the repo's existing `upgradeLegacyProposal` / upgrade-on-open pattern
  (`lib/proposals/upgrade.ts`), which is the precedent to follow.
- **Never regenerate** `__tests__/fixtures/proposal-signature-goldens.json`. Any new field
  must be hash-covered only-when-present, exactly as `terms` was, so existing signed hashes
  stay valid.
- One page-level composition serves web **and** print/PDF. The archetype layer is what
  finally makes that possible — today the composition is written twice and kept in sync by
  discipline.

---

## §12 The polish gate — VERIFIED design (§6A.6)

Adversarial audit run 2026-08-18 against the real code. **It refuted two of my priors and
found two live defects.** Recorded honestly:

### What was refuted

- **"Contrast is computable, so gate it."** Wrong for the accent: `lib/branding.ts:78-116`
  (`contrastRatio` / `accentForTextOnWhite`) already **clamps** brand accent to AA on white,
  and `ProposalTheme.tsx:26-33` exposes it as `--proposal-accent-ink`. A gate there could
  never fire. The failure mode is already unreachable.
- **"Image dimensions are a small additive change."** Wrong. There is no server-side image
  decoder in the tree (no `sharp`, no `image-size`), cover images are bucket-token URLs with
  no asset record to hang a sample on, client-supplied dimensions are untrusted, and the
  entire existing corpus has none — so the check must pass on `undefined`, which makes it
  **theater**. Deferred out of v1.

### The hero scrim — fixed by arithmetic, not by a gate (upgrades §5.3)

**§5.3 is confirmed as a live defect, with numbers.** `bg-black/40` over a near-white cover
composites to `#999999`; by the repo's own `relativeLuminance` that is **2.85:1** for the
white title (fails AA 4.5:1 *and* the 3:1 large-text floor) and **≈2.4:1** for the
`text-white/80` subtitle. Any bright cover image breaks it today.

Solving the WCAG formula for the alpha that holds against the worst possible image (pure
white): **α ≥ 0.535 guarantees 4.5:1**, **α ≥ 0.416 guarantees 3:1**. So a fixed
`bg-black/60` scrim — or a `to-black/70` bottom gradient, which reads better and still
clears the bound in the text band — makes the hero **unconditionally AA for any image**,
with no sampling, no data capture, no gate, no override.

This is the same move as `accentForTextOnWhite`: **eliminate the failure mode rather than
detect it.** It is the pattern the whole polish guarantee should follow — a gate is the
fallback for what the layout system cannot make unfailable.

### Two live defects the audit surfaced

1. **You can send an already-expired proposal.** Expiry is enforced only at *sign* time
   (`actions/proposals-public.ts:168`); `sendProposal` checks nothing.
2. **Placeholder blocks are silently dropped.** `ProposalDocument.tsx:88` strips them from
   customer output, so the client receives a document with holes and **nobody is told** —
   the `SendDialog` warning is non-blocking text beside an always-enabled button.

### Where the gate lives — VERIFIED

`actions/proposals.ts:77` `sendProposal`. It is the **only** writer of `status: 'sent'` in
the codebase (`updateProposalDraftCore`'s `CLEARABLE_FIELDS` whitelist cannot reach
`status`), and it already re-reads the full document before writing, so every field the gate
needs is in hand. `SendDialog` is documented "Presentational only" and is not a control — a
server action is a public POST endpoint.

**Override precedent already exists in-house:** `voidProposal` (`actions/proposals.ts:128-140`)
requires a non-empty `reason`, throws without one, and persists it. Same shape:
`sendProposal(orgId, proposalId, override?: { reason: string })` — throw a structured error
naming every failed check; on override persist `{ reason, checks, by, at }`.

### The v1 gate — blocking, zero schema change

1. **No price** — `proposalRange(proposal).max <= 0` with no items and no packages.
2. **Placeholders remain** — `blocks.some(b => b.placeholder === true)`. Fixes defect 2.
3. **Already expired** — via `proposalExpiryInstant`. Fixes defect 1.
4. **Empty document** — no blocks after placeholder filtering.

**Warn-only:** missing `terms`, missing `expires_at`, no client email. *(Note: "send" does
not email anyone today — it flips status and the operator copies a link. There is no
proposal-sent template in `lib/email.ts`. So the email check is "you have no way to deliver
this", not a delivery precondition.)*

**Explicitly NOT gates — made unfailable by the layout system instead:** hero contrast
(scrim constant), measure/widows/orphans (`max-w-[65ch]` + `text-wrap: pretty`;
`ProposalDocument.tsx` already does the print-break half), image resolution (deferred until
dimensions are genuinely captured).

---

## §13 Video — VERIFIED design (Decision 1)

Adversarial audit run 2026-08-18. **It refuted the obvious implementation** and surfaced a
production bug plus a security gap.

### What was refuted: the auto-poster facade

"Operator pastes a link, we generate a branded poster from oEmbed" fails three ways:
1. **The free thumbnail is not art-directable.** YouTube's `maxresdefault.jpg` 404s whenever
   the source is under 1280×720; the guaranteed fallback `hqdefault.jpg` is **480×360, 4:3,
   with baked-in black letterbox bars**. On a document whose entire pitch is polish, that is
   worse than having no video section.
2. **Hotlinking the thumbnail leaks the client's IP to Google before any click** — which
   destroys the privacy property that justified the facade. Proxying or re-hosting the
   poster means building the upload path anyway.
3. **Post-click the player is theirs and cannot be cleaned.** `rel=0` has not disabled
   related videos since 2018; `youtube-nocookie` fixes tracking, not branding. End-screen
   grid, channel chrome and "Watch on YouTube" all remain.

### The design that survives: poster-first facade

Operator **uploads the poster** (reuses `uploadProposalImage` verbatim — art-directable,
cropped to our aspect, our play affordance, our type) and the pasted link supplies **only
the player**, injected on click. Zero third-party bytes until click; the poster is ours.

**Security constraint — load-bearing.** Do NOT store a URL and render it in `src`.
`normalizeBlocks` currently accepts **any** `https?://` URL (`isHttpUrl`), and three
separate paths mint blocks (`lib/ai/proposal-draft.ts`, `lib/proposals/skeletons.ts`,
`merge-draft.ts`). Storing a raw URL would put an arbitrary origin inside an `<iframe>` on a
public, unauthenticated page. **Store `{ provider: 'youtube'|'vimeo'|'loom', video_id,
poster_url }` and construct the embed URL in the renderer** — the union *is* the whitelist,
enforced in `normalizeBlocks`.

Print degrades to poster + caption + human-readable link, inside `break-inside-avoid` like
the existing image/testimonial cases.

**Effort:** ~1–1.5 days (types union + `PROPOSAL_BLOCK_TYPES`, `normalizeBlocks` video case,
`ProposalBlockView` facade + print branch, `BlockCanvas` editor reusing `pickImage`, the
three block-minting paths, and five existing test suites), +0.5 day for CSP headers.

**Failure modes, stated:** post-click the document is no longer ours and this is unfixable
within the approach; dead-link rot (video deleted → perfect poster, broken player, no
signal); the poster becomes required work, so the block is *harder* to complete than a naive
embed; provider URL-shape drift (Shorts, `youtu.be`, unlisted-Vimeo `/123/hash`, Loom
`/share/` vs `/embed/`); iOS takes over the screen at first tap.

### Two findings outside this scope

- **PRODUCTION BUG — file its own ticket.** `MAX_IMAGE_BYTES = 8MB` (`lib/uploads.ts:1`) and
  `bodySizeLimit: '10mb'` (`next.config.ts:6`) are both **above Vercel's hard 4.5MB request
  body limit**. Next's `bodySizeLimit` cannot raise a platform limit. Any image between
  4.5MB and 8MB passes validation locally and **413s in production**, surfacing as a generic
  upload failure. This affects proposal images and org logos/covers today.
- **No CSP exists anywhere** — no `headers()` in `next.config.ts`, no `vercel.json`; `proxy.ts`
  sets no response headers. Add `frame-src` limited to the three providers as defence in
  depth behind the `normalizeBlocks` whitelist. `frame-ancestors` is also unset, so the
  public proposal page is **clickjackable today** — same file, unrelated cause.

### Cost of the alternative, if we ever hold the bytes

Direct upload + `<video>` is **not viable through the current path** (4.5MB body cap; the
action buffers the whole file in memory). Doing it properly needs signed resumable uploads
straight to GCS plus a **bucket-wide CORS change** — an ops step, security-relevant, with no
CORS config anywhere in the repo today. And without transcoding there is no codec fallback:
an operator's 4K iPhone HEVC clip plays in Safari and shows a **black rectangle in Chrome on
Android**. If we ever need hosted video, a platform is the answer — Cloudflare Stream is
~$6.50/mo at our scale (billed on duration, not file size), Mux ~$0–10 (first 100k delivered
minutes free). Neither is needed for the recommended design.

### ⚠️ Unverified claim, corrected

The audit cited `docs/strategy/2026-08-08-beacons-parity-feature-request.md` as prior art
naming embedded video. **I checked: that file contains no mention of video.** The quoted
lines are from *this spec* (§3 and the old §9). Misattribution — struck, not relayed.

---

## §14 PDF — VERIFIED design (Decision 4)

Adversarial audit + two deep library studies, run 2026-08-18.

> **DECIDED 2026-08-18: TYPST.** The PDF is a deliberately print-native artifact, not the web
> document on paper. Everything below is retained as the evidence trail — the Chromium
> material is now the **rejected alternative**, kept because it documents precisely what we
> avoided and what we'd face if this is ever revisited.

**Chosen: Typst** (Apache-2.0, v0.15.1), receiving a JSON payload via `sys.inputs` computed by
the same `lib/proposals.ts` functions the web page uses, generated on send and cached to
`adminBucket` with a tokenized URL. Binding: `@myriaddreamin/typst-ts-node-compiler` (native
N-API, 54MB, fonts-from-bytes), with the official static musl binary + `child_process` as the
zero-third-party-risk fallback. Full comparison and risks in §14A.

### Three consequences of choosing Typst

1. **The sequencing tension dissolves — favourably.** The Chromium plan would have *hardened*
   `/print` as the PDF's source of truth, cementing the very duplication §10.1 exists to
   delete. Typst does not render `/print` at all. **The HTML print route can be retired**
   (or demoted to a plain browser-print fallback) rather than reinforced — one fewer
   duplicate composition, not one more.
2. **NEW REQUIREMENT — org font binaries.** Typst's `fontArgs: [{ fontBlobs: Buffer[] }]`
   needs the actual font file. Under Decision 4b (free font choice) we must therefore
   **resolve and store a real font binary per org**, not just a family name — fetch it at
   selection time and cache it. A Chromium renderer would have fetched webfonts implicitly;
   Typst makes this explicit work. Design it into the font-selection flow, not after.
3. **§10's archetypes are what make a second implementation tractable — and this is the
   load-bearing point.** With arbitrary blocks and operator-authored layout, a second renderer
   would be an unbounded surface. With **14 named archetypes**, the Typst template is a
   finite, enumerable set of functions — one per archetype, each mirroring a designed layout
   we already specified. **Decisions §10 and §14 reinforce each other**; neither is as
   defensible alone.

### Rejected alternative — headless Chromium (research retained)

**Would have been:** `puppeteer-core` + `@sparticuz/chromium` rendering `/print` over HTTP,
~2–4 days. Rejected on cold start (7–15s vs 60ms), the open Fluid Compute concurrency race,
absent hyphenation on serverless Linux, and parity-tier output. The traps below apply **only
if this is ever revisited**:

### Why the JS-renderer alternative is disqualified — on architecture, not capability

Be precise about this, because `@react-pdf/renderer` is **typographically better than I
assumed**: hyphenation is on by default (Liang/TeX patterns), `orphans`/`widows` default to
2, `wrap={false}` gives keep-together, `fixed` gives repeating table headers (verified
empirically by the researcher), real Yoga flexbox, ~130ms cold path, no native binaries. On
typography alone it is a credible choice.

It is disqualified because **it cannot render one line of our existing tree** — no DOM
elements, no `className`, no Tailwind, no CSS grid, no `boxShadow`. And it would not be a
*second* implementation but a **fourth**: `BlockCanvas`/`PricingCanvas` (builder),
`ProposalResponseClient` (public), and `print/page.tsx` all share these components today,
and the builder canvases state in-source that reusing *the same classes* "is what makes this
canvas WYSIWYG rather than merely similar."

**So a JS renderer breaks the builder's WYSIWYG guarantee by construction** — the operator
would preview an artifact produced by a different engine than the deliverable. That is the
disqualifying argument, and it holds regardless of how good react-pdf's typography is.

The drift cost is already on the record: the incident documented in `ProposalPricing.tsx`'s
header (packaged proposals printing with **no price**, add-ons printing as included, printed
subtotals contradicting the web page) took **644 insertions across 5 files** to remediate.
§10.1 targets the opposite: one composition serving web and PDF.

*Also checked and rejected:* `satori` (renders text as outlines — not selectable — and has no
pagination concept), `pdfkit` (no layout engine at all; coordinate arithmetic), `pdf-lib`
(upstream abandoned since 2021-11; no text-flow engine).

### Traps that must be designed in, not discovered

1. **Render `/print`, NEVER `/proposals/[token]`.** The interactive page fires
   `recordProposalView(token)` in a mount effect — a Chromium visit would **fabricate a
   customer-open signal**, stamp `first_opened_at`, and log a bogus "viewed" activity.
2. **Preview deployments would render PRODUCTION content.** `NEXT_PUBLIC_BASE_URL` points at
   production, and Deployment Protection 401s preview URLs. Left undesigned, this silently
   defeats the preview walkthrough this repo mandates.
3. ~~**Not auto-enrolled in the 5GB function path.**~~ **SUPERSEDED by deeper research:** the
   package is only **~70MB of Brotli payload** in the bundle — the 219MB decompressed binary
   never lives there. **We almost certainly never hit the 250MB limit and never need Large
   Functions.** The binding constraint is **`/tmp` (~500MB, of which extraction consumes
   ~219MB)**, and Large Functions does nothing for that.
3b. **Do NOT use `@sparticuz/chromium-min`, despite Vercel's own KB recommending it.** It
   ships no binary, so every cold start fetches ~65MB over the network first — trading a
   size problem we don't have for an availability problem we'd own forever. A real report has
   that fetch timing out from GitHub Releases. Vercel's newer 250MB KB now names Puppeteer as
   "exactly the kind of workload large Functions are designed to support"; the two Vercel docs
   contradict each other and the newer one wins.
4. **Version coupling.** `@sparticuz/chromium` and `puppeteer-core` must be pinned as a
   compatible pair; v149 is **ESM-only** and `defaultArgs()` returns a promise, so it must be
   `await import()`ed.
5. **Tofu glyphs** on CJK/emoji in customer-typed content — Inter self-hosts fine via
   `next/font`, but there is no system fallback. Ship a Noto fallback.
6. **Memory is project-wide on Vercel**, not per-function. Raising it for Chromium raises the
   floor for all of TraxEvent.
7. **Local dev breaks** — the `@sparticuz` binary is Linux-only; needs a local-Chrome branch.

### ⚠️ THE production risk — `@sparticuz/chromium` issue #507, OPEN

**[Issue #507](https://github.com/Sparticuz/chromium/issues/507), opened 2026-07-25, still
open with zero maintainer comments, filed specifically against Vercel Fluid Compute.**

`executablePath()` early-returns on `existsSync('/tmp/chromium')` — but `createWriteStream`
creates that file (size 0) the *instant* decompression begins. For the entire multi-second
Brotli decompress, a concurrent caller's check already passes and it receives a path to a
**fragment**. Measured in the report: a second caller got the path ~600ms in, when the file
was ~65MB of an eventual ~199MB → `spawn ETXTBSY`.

**The worse failure mode:** if an invocation dies mid-extraction (timeout/OOM), `/tmp/chromium`
is left truncated with no writer, and **every subsequent invocation on that instance passes
the guard and launches a corrupt binary — a persistent failure for the life of the instance.**

Classic Lambda ran one invocation per sandbox and was immune. **Fluid Compute is now the
default**, so this is not an edge case — it is our execution model.

**Mandatory mitigations, not optional hardening:**
- A **module-scope single-flight promise** around `executablePath()`, so only one invocation
  per instance ever triggers extraction.
- An **`ETXTBSY`-scoped retry** that first `unlink`s a suspiciously-small `/tmp/chromium`.
- **Cap concurrent renders to 1–2 per instance** (semaphore). Under Fluid's in-function
  concurrency, N simultaneous requests means N Chrome processes in one box — and an OOM
  poisons the instance per the above.
- Close pages in a `finally`; leaked profile dirs fill the ~280MB of `/tmp` left after
  extraction ([#231](https://github.com/Sparticuz/chromium/issues/231)).

**Pre-verify on a real preview deploy, not locally:** `/tmp` size, whether `hyphens: auto`
fires, cold-start wall time at 4GB, and **5 simultaneous requests against a cold instance** —
that last one is the #507 reproduction and the single most likely production incident.

### Print-CSS ceiling — EMPIRICALLY TESTED (headless Chrome 151 + headless-shell 152)

Both binaries produced **identical** capability results, which matters since we'd run
`headless: "shell"`.

| Feature | Verdict |
|---|---|
| `widows` / `orphans` | ✅ **Work.** A/B proven: raising them moved all four lines to the next page. The common claim that Chrome ignores them is **false** — Chrome 25+, print only. |
| `break-inside: avoid` | ✅ Works (Chrome 50+) |
| Repeating `<thead>` across pages | ✅ Works via `display: table-header-group` |
| `@page` margin boxes (all 16) + `counter(page)`/`counter(pages)` | ✅ Works — Chrome 131+. Real page numbers in our own stylesheet. |
| `string-set` / `content: string()` running headers | ❌ **Absent from BCD entirely; the whole declaration is dropped.** Running headers must be **JS-injected per section**. |
| `hyphens: auto` | ⚠️ Fires on macOS; a documented cluster of **Linux/headless failures** (dictionaries are a runtime component, killed by `--disable-component-update`). **Assume no hyphenation on Vercel and design the measure accordingly.** |
| Tagged PDF (`/StructTreeRoot`, `/MarkInfo`, `/Lang`) | ✅ **On by default** — since Chrome 85, not 101. Tagged ≠ PDF/UA-conformant; don't promise compliance without a validator. |
| Live links, selectable text | ✅ Both preserved |

**Puppeteer defaults that must be overridden:** `printBackground: false` and — the classic
silent bug — **`preferCSSPageSize: false`**, which makes our `@page { size }` be *ignored*.
`waitForFonts: true` and `tagged: true` are already correct.

### Two constraints that hit our specific design

- **`@page` silently refuses to fetch network/file resources — reproduced.**
  `@top-left { content: url(logo.png) }` produces **no `/XObject` at all**, no error, no
  warning; the same rule with a `data:` URI renders fine. **Any brand logo in a running
  header/footer must be base64-inlined.** Still true in Chrome 151/152.
- **Only Open Sans ships in the bundle.** Combined with Decision 4b (free org fonts), **every
  org typeface must arrive as an embedded/base64 webfont** or typography silently falls back.
  Inter self-hosts fine via `next/font`; arbitrary org fonts need an explicit path.

### Budget and shape

Cold **~7–15s** (Brotli decompress is CPU-bound: ~10s at 512MB, ~5s at 2GB), warm **~1–3s**.
`maxDuration` ≥ 60 — which makes this **Pro-only in practice**. Buy **4GB/2vCPU** purely to
halve decompression. **Response body caps at 4.5MB**, so write to storage and return a URL —
which the on-send caching design already does.

**Fallback if the concurrency race proves unmanageable:** Gotenberg as a **Vercel Container
Function** (one always-warm renderer, no extraction race) — but prove the image-size question
on a throwaway deploy first. **Browserless `/pdf`** is the buy-the-problem-away option at
$25–140/mo. *(Browserbase is on the Marketplace but is the wrong tool — billed in
browser-hours for AI agent sessions, not 3-second renders.)*

### §14A REOPENED — Typst is a genuinely better PDF engine (verified 2026-08-18)

A further study benchmarked **Typst** (Apache-2.0, commercially backed, v0.15.1 2026-07-17)
with real compiles. It beats headless Chromium on nearly every axis that matters here:

| | Chromium | **Typst** |
|---|---|---|
| Cold start | **7–15s** (Brotli decompress, CPU-bound) | **~60ms** (measured, 4-page doc w/ 90-row table) |
| Warm | 1–3s | **1–2ms** |
| Footprint | ~70MB bundle, **219MB into `/tmp`** | **54MB**, nothing extracted |
| Concurrency race (#507) | **Open, unfixed, Fluid-specific, can poison an instance** | **N/A** — no extraction step |
| Hyphenation | ⚠️ **Assume unavailable on serverless Linux** | ✅ Real Liang/TeX dictionaries, verified working |
| Line breaking | Greedy | ✅ **Knuth–Plass globally optimized** |
| Widow/orphan | ✅ CSS, coarse | ✅ `costs:` knob (coarse too) |
| Repeating table headers | ✅ `thead` | ✅ default-on |
| Running headers | ❌ must JS-inject (`string-set` unsupported) | ✅ native |
| Header/footer images | ❌ **must be base64-inlined** (`@page` silently drops fetches) | ✅ normal |
| PDF/A | ❌ | ✅ **A-1/2/3/4, all levels** |
| Tagged PDF | ✅ structure only | ✅ **PDF/UA-1 with real validation enforcement** (rejected a test doc for missing alt text) |
| Org fonts (Decision 4b) | webfont fetch | ✅ **fonts-from-bytes API** |

**The catch is the same one that disqualified `@react-pdf/renderer`: Typst is a separate
layout language — ~600–1,200 lines of template, a second implementation.** Intellectual
consistency demands I apply that standard evenly.

**Why the "make Typst the single source, render the web view from it too" escape hatch fails
here:** Typst produces **fixed page geometry**. The web document's primary surface is a phone
(§5.5) and it must **reflow**. It is also interactive — tier selection, add-on checkboxes,
sign form, Stripe. Neither survives an SVG-rendered fixed-page view. So Typst cannot be the
single source; the web document stays HTML.

**But one thing changes the drift calculus.** The `ProposalPricing` incident was **numeric**
(packaged proposals printing with no price, add-ons printing as included, subtotals
contradicting the web page) — not visual. Typst receives a **JSON payload via `sys.inputs`**
computed by the same `lib/proposals.ts` functions the web page uses. **That class of bug
cannot recur**, because neither surface recomputes anything. What remains is *visual*
divergence, which is a design-discipline problem, not a correctness one.

### So this is a product decision, not a technical one

- **If the PDF is "the web document, on paper"** → Chromium. One composition. Accept the
  7–15s cold start, the #507 race, no hyphenation, and base64-inlined header images.
- **If the PDF is a deliberately print-native artifact** — cover page, running heads,
  Knuth–Plass justification, real hyphenation, PDF/UA — → **Typst**. A second implementation,
  but an *intentional* one.

**The ambition argument favours Typst.** Every competitor prints through Chromium, so a
Chromium PDF is structurally parity-tier (§2: parity is "good", not "great"). A Typst PDF
would be a printed artifact **no one in the category can match** — which is exactly what
§6A.7 asks for. Under the gate, "everyone does it this way" is a throttle-down tell.

**Typst risks, stated:** the Node binding (`@myriaddreamin/typst-ts-node-compiler`) is a
community package with a bus factor of one (mitigation: ship the official 53MB static musl
binary and shell out — same engine, upstream-supported); no `@preview` imports (vendor
anything needed); set `HOME=/tmp` defensively; `.node` tracing may need
`outputFileTracingIncludes`. All benchmarks are macOS arm64, **not** measured on Vercel.

*Also checked and rejected: LaTeX-in-WASM in every form. SwiftLaTeX is abandoned and its
package server no longer resolves in DNS; texlive.js died in 2017; tectonic has no WASM build
(issue open since 2018) and fetches a **2.75GB TeX Live 2022** bundle at render time; the one
maintained option (busytex) is **AGPL-3.0**, browser-only, and unproven in Node.*

### Sequencing — this one is load-bearing

**Land the shared-composition refactor (§10.1) BEFORE the PDF route.** Option A cements
`/print` as the PDF's source of truth, and increment 1 exists to *delete* that duplicated
composition. Build the PDF first and we harden the exact duplication we are trying to remove.

### Free findings

- **`print-color-adjust` is set nowhere in the repo**, and `ProposalPricing.tsx:78` fills the
  selected-package badge with the brand accent. In today's Save-as-PDF the brand accent
  **silently disappears** unless the customer ticks "Background graphics."
- **Chrome 131+ supports all 16 `@page` margin boxes** with `counter(page)`/`counter(pages)`,
  so real page numbers are expressible in our own stylesheet. `string-set` running headers
  are still unsupported.
- **Signature goldens are safe** — `lib/proposal-signature.ts` hashes canonical *content*
  (title/items/packages/terms/selection), never layout. No PDF work can invalidate them.

### The one thing that would make this wrong

If the PDF should be a **different artifact** from the web document — print-native, with a
cover page, running heads, a TOC and an appendix rather than a faithful rendering of what the
customer saw — the "one composition" argument collapses, and `@react-pdf/renderer` goes from
disqualified to reasonable. **Everything above assumes the PDF is the web document, on paper.**

---

## §15 The template ladder — simple to advanced (user directive, 2026-08-18)

> *"Not everyone is going to have one [a video]. I hope we're creating templates to meet
> people's needs and objectives from simple to advanced."*

This is a first-class requirement, not a nicety, and it changes two things.

### 15.1 The absence rule — every archetype is optional

**No section is required, and a missing section must never read as a missing section.** A
document with no video, no gallery and no team must still read as *designed* — not as a page
with holes where content should be. This is the skill's n=0 cardinality rule applied
per-archetype, and it is the single hardest constraint on the layout engine:

- Each archetype's layout must be composed so that **removing it changes the rhythm, not the
  integrity** of the page. Sections cannot depend on their neighbours for spacing or
  alternation.
- Alternating treatments (full-bleed / inset, light / accent) must be computed from the
  **rendered sequence**, not authored per-section — otherwise deleting one section produces
  two adjacent identical bands.
- This is also why the §12 gate blocks placeholder blocks: today they are *silently
  stripped*, which is exactly "absence that looks like absence" reaching a customer.

**It also reinforces Decision 1.** The ambient loop is something any operator can capture on
a phone in ten seconds; a pitch video is rare. Loop-first is not just the cheaper build, it
is the one with near-universal input — and the pitch facade stays purely additive.

### 15.2 The ladder — build on what already exists

There is already a template layer: `lib/proposals/skeletons.ts` + the skeleton picker route,
and org-owned `ProposalTemplate` (`orgs/{orgId}/proposal_templates`) with its own builder.
**The ladder is a curation of those, not a new concept.** Three starting points:

| Tier | Sections | For |
|---|---|---|
| **Quick quote** | cover · letter · tiers · investment · accept · terms | The operator who wants a price out the door in five minutes. Must still beat their current emailed PDF on craft — this tier is where most first proposals will live. |
| **The pitch** | + menu · gallery · logistics | The default. Adds the two vertical-specific sections and the trust surface. |
| **Full proposal** | + ambient loop · day plan · team · testimonials *(+ pitch video, inc. 2)* | The operator with material to show. |

**Design rules for the ladder:**
- **It is a starting point, never a mode or a paywall.** Every tier can add any section
  afterwards; nothing is locked. An operator who starts at Quick quote is not in a lesser
  product.
- **Quick quote must be genuinely excellent**, not a stripped stub. It is the tier that
  proves the polish guarantee to a first-time operator, and the tier most documents will use.
- **The AI drafter proposes the next rung.** It already has lead context and the voice
  few-shot; suggesting "you have three past events with photos — add a gallery?" is the
  natural anticipation move (§4.6) and costs no new plumbing.
- **Templates inherit archetypes automatically.** Per the templates work, `ProposalTemplate`
  stores the same content shape as a proposal — so the archetype layer must land in that
  shared shape, or templates silently keep producing the old block soup.

---

## §11 Open questions still outstanding
All six §9 questions are answered. What remains:

**Pending adversarial verification (in flight, results fold into §7):**
- **Video hosting mechanism** — facade-embed of a hosted link vs. direct upload vs. a video
  platform. Decision 1 fixes the *presentation*; the *plumbing* is unverified. Constraint:
  the Firebase project enforces uniform bucket-level access and forbids `allUsers` IAM, so
  anything we host uses tokenized download URLs — `makePublic()` must never reappear.
- **Serverless PDF route** — headless Chromium vs. a JS PDF renderer. The decisive question
  is whether the alternative forces a **second layout implementation** that will drift from
  the web one; that drift already burned this repo (see the header comment in
  `components/proposals/ProposalPricing.tsx`).
- **Polish-gate minimum check set** — which checks are genuinely computable server-side at
  send time. My prior: contrast is computable, placeholder/empty is already half-built in
  `SendDialog`, image resolution needs dimensions captured at upload, and **measure/widows
  are not gate-able at all** — those must be guaranteed by the layout system instead.

**Product questions I need from you, not from the code:**
- **Font choice — my position is zero.** §6A.3 says the operator supplies a logo and one
  accent, and *we* derive the type pairing. Confirm you're happy that an org can never pick
  a font, because that constraint is what makes the polish guarantee possible.
- **`menu` and `day_plan` before the catalog rebuild** — ship them as operator-authored
  sections now (they become derived later), or leave them out until the catalog link exists?
  My read: ship them authored — they are the two sections that most differentiate the
  document, and the archetype layout is the expensive part, not the data source.
- **Blind-rank benchmark** — confirm keep or cut (§9.6).

**Deferred to increment 4:** the date hold's mechanism under the every-tier decision — read
capacity ungated, or degrade to a plain date-conflict check on lower plans.
