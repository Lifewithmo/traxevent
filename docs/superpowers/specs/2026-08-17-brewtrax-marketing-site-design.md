# BrewTrax Marketing Site — Design Spec

**Date:** 2026-08-17
**Status:** Approved design, pending implementation plan
**Surface:** Public marketing website for the **BrewTrax** brand (mobile-beverage vertical of TraxEvent)
**Primary goal:** Self-serve free signup by a solo/small mobile-beverage operator

---

## 1. Context & job-to-be-done

BrewTrax is the mobile-beverage vertical brand of TraxEvent (`lib/brands.ts`,
`industryPackId: 'coffee-cart'`). It runs the full booking → proposal → invoice →
event-day operations spine **plus** Hot Plate-style online "drops" ordering — and
its monetization is **subscription-only, with no per-order fee**, against Hot
Plate's 5% + $0.55 per-order cut (see [[traxevent-monetization-decision]],
[[drops-online-ordering-status]]).

**Job-to-be-done (one sentence):** A non-technical, phone-first mobile-beverage
operator, evaluating tools between gigs, needs to see — in seconds — that BrewTrax
lets them sell their drops and run their whole business while keeping every dollar,
and to start for free without friction.

**Roles served (Cooper / Goodwin):**
1. **The drops refugee** — currently on Hot Plate, resents the per-order fee, wants
   out. Highest-pain, wallet-open. Served hard by the wedge + the `vs Hot Plate`
   page + a hero escape-hatch.
2. **The all-in-one operator** — books events *and* sells drops; wants one tool
   instead of the patchwork. The home hero's primary narrative.
3. **The events-only mobile bar** — weddings/corporate, doesn't sell weekly drops;
   served by the OS story + the use-case page.

**Cardinality:** Marketing pages are n:few content surfaces (a handful of curated
sections per page). The one n:many surface is the **Proof Wall** (many operator
stories) — it degrades from rich cards (few) to a compact list/logo strip as the
roster grows, and the empty state is founder-honest onboarding, never a void
(see §7).

## 2. Decisions locked in brainstorming

| Decision | Choice | Note |
|---|---|---|
| Target brand | BrewTrax (mobile beverage) | Sharpest launch wedge |
| Primary CTA | Start free (self-serve) | No card; ≤2-field handoff |
| Hero angle | **All-in-one, wedge pulled above the fold** | Broad OS story + fee proof at fold |
| Centerpiece | **Phase it: Fee Autopsy + named live preview now; full scrape-Mirror as a spike-gated fast-follow** | v1 = great; Mirror = category-defining, hypothesis |
| Scope | **Full ambitious site (8 pages)** | 4 wedge-carriers ship first within that |

## 3. Design-ambition placement (honest)

- **Ladder:** baseline spine was *good* (generic SaaS shape). This design reaches
  **great** in v1 via the Fee Autopsy (the central claim becomes the operator's
  *own computed dollar figure* instead of an infographic), and **category-defining**
  when the full Mirror ships (the site performs the operator's switching cost for
  them, using data only this vertical exposes: a "drop" object + public storefronts
  + a resented per-order incumbent).
- **The genuine idea (gate 2):** the site *proves* the fee-free claim with the
  operator's own store/numbers rather than asserting it. No horizontal tool
  (Square, HoneyBook, Calendly) can copy the Mirror — they have no drop object and
  no resented per-order incumbent to mirror against.
- **Named human context (gate 3):** the three roles above; every section traces to
  one of them, not to a schema.
- **Logged tension:** the critic panel preferred *committing* the hero to the drops
  refugee; the broad all-in-one hero was chosen instead. It clears the bar only
  with (a) a coffee-cart-specific headline, (b) the fee autopsy at the fold, and
  (c) a "just here for drops? →" escape-hatch. The design mandates all three.

## 4. Site architecture

Brand-aware marketing site in `app/(marketing)`, **served at `brewtrax.com`**. Per
the brand model, brand domains own acquisition and every signup CTA hands off to the
app origin (`NEXT_PUBLIC_APP_ORIGIN`, e.g. `traxevent.com`). Pages are
brand-parameterized where practical but this spec's content is BrewTrax-specific.

**Pages (8):**

| # | Page | Route | Role | Wedge-carrier |
|---|---|---|---|---|
| 1 | Home | `/` (brand) | converter | ◆ |
| 2 | vs Hot Plate | `/vs/hotplate` | drops refugee, decision-stage | ◆ |
| 3 | Pricing | `/pricing` | kills price fear | ◆ |
| 4 | For mobile beverage | `/for/mobile-beverage` | vertical proof | ◆ |
| 5 | Features | `/features` | evaluator detail | |
| 6 | Stories | `/stories` | trust | |
| 7 | About / Our Why | `/about` | brand/philosophy | |
| 8 | Resources | `/resources` | SEO seed (thin v1) | |

**Never cut:** 1–4 (they carry the wedge). **Ships thin:** 8.

**Shared components (new):**
- `MarketingNav`, `MarketingFooter` — chrome; nav includes `vs Hot Plate` and a
  dominant `Start free`.
- `FeeAutopsy` (client) — sliders (orders/drop, drops/month, avg order value) →
  live computed annual dollars kept vs Hot Plate's 5% + $0.55. Pure client-side
  math, no signup. **Reused on Home, vs Hot Plate, Pricing.**
- `StorePreview` (client) — type a cart name → render a live BrewTrax public-page
  mock (drops, prices, pickup windows) fee-free. Reuses the real drops/public-page
  styling so it is truthful, not a fabricated mockup.
- `ComparisonMatrix` — BrewTrax vs Hot Plate feature/fee rows.
- `ProofWall` — operator stories (cart, city, face, one hard number); handles
  0 → few → many (§7).
- `ObjectionBand` — inline reassurance chips / mini-FAQ.
- `CtaBand` — the reflective closing CTA, reused across pages.

**Claim-my-page control:** on Home the hero field is `StorePreview`'s entry point.
In v1 it renders a **named live preview** (`brewtrax.shop/<their-name>` typed →
instant styled page). It does **not** scrape in v1 (see §6).

## 5. Page specs

### 5.1 Home (`/`)

Spine, top to bottom (each section traces to a role):

1. **Hero** — coffee-cart-specific headline (e.g. *"Your store. Your customers.
   Every dollar."*), one-line sub that names the vertical and the two winning ideas
   (keep 100% + one app), the **Claim-my-page** field, and the **Fee Autopsy result
   visible at the fold**. Primary CTA `Start free` (dominant); `See how it works`
   demoted to a text/inline-video link, not a co-equal button. **A real product
   visual is required — no placeholder ships.**
2. **The wedge, as money** — "Your money. All of it." A *worked dollar example*
   (mirror Hot Plate's own "Sarah's Bakery $30 order" framing) showing the delta
   going into the operator's pocket. States the one unavoidable cost (Stripe
   processing 2.9% + $0.30 passes straight through; BrewTrax adds nothing) — this
   admission is what defuses "too good to be true."
3. **Live store preview** — `StorePreview`: type your name → your drops page renders
   fee-free. Answers "will this look professional?" and "will my customers use it?".
4. **The OS** — booking → proposal → invoice → event-day → drops in **task-flow
   order** (not schema order; honors [[design-no-block-stacks]]). This is where the
   all-in-one story lives, deliberately *below* the wedge.
5. **Proof Wall** — **v1 ships the founder-honest empty state** (no real operator
   stories yet, §7): "we're new — here's who we built it with" + a concrete
   guarantee + trust primitives (Stripe/security badge, export-anytime, no-contract).
   As real stories arrive, this becomes cart + city + face + one hard number
   ("$4,200 in drops last month, $0 in fees") — never influencer follower-counts
   (Hot Plate's alienating pattern we beat).
6. **Objection band** — price (stated, links Pricing), buyer experience ("your
   customers order from a link — no app, no account"), export anytime, no contract,
   legitimacy (company/founder, security/Stripe badge).
7. **Reflective close** — `CtaBand`: *"Keep what you earn. Claim your page."* +
   a **"Just here for drops? →"** link to `/vs/hotplate` (the refugee escape-hatch).

**Interaction-cost budget (highest-frequency flow — land → account):**
land → (optional autopsy drag, 0 fields) → tap `Start free` → **one signup screen:
email + password OR Google/Apple one-tap; cart name deferred to first-run** →
account. Target: **≤2 fields to reach an account.** CTA microcopy: *"Start free — no
credit card, live in minutes."* (Signup UI itself is existing app surface; the site
only owns the handoff and the microcopy.)

### 5.2 vs Hot Plate (`/vs/hotplate`) — the conversion workhorse

- `ComparisonMatrix`: fees (0% vs 5% + $0.55), **buyer-facing surcharge** (none vs
  Hot Plate's ~$2.30 on a $20 order shown to *your* customer at checkout),
  booking/proposal/invoice spine (yes vs no), phone-first, export/no-contract.
- Embedded `FeeAutopsy`.
- Framing rules (from the wedge research): state the competitor's cost **concretely
  and neutrally, sourced, never as a sneer** — "let the arithmetic be the insult."
- SEO target: "hotplate alternative." This page is also the drops refugee's home.

### 5.3 Pricing (`/pricing`)

- **Three flat monthly tiers: $39 / $79 / $149.** Prices are stated on the page
  (hiding them makes a non-technical operator assume "expensive" and bounce). The
  card layout uses the classic good/better/best pattern with the middle **$79** tier
  as the visually-anchored "most popular" default (decoy-effect: the $149 tier makes
  $79 read as the reasonable choice). Tier *names* and the exact feature split per
  tier are a plan detail (proposed working names: **Starter $39 · Pro $79 · Growth
  $149**); the free-tier/trial question is resolved in favor of a **no-card free
  trial** on every tier (matches the `Start free` CTA, no separate free plan to
  design in v1).
- Every tier keeps the **0% per-order** promise — the tiers gate *capability/scale*
  (team seats, drops volume, advanced ops), never a cut of sales. Say this
  explicitly on the page so no visitor fears the fee wedge is tier-locked.
- "The one cost we can't remove": Stripe processing passthrough, framed like
  Fourthwall/Shopify honesty.
- Worked example + embedded `FeeAutopsy`.
- Anchor the revenue model explicitly: "We charge a flat subscription — that's how
  we make money, so we never need a cut of your orders."

### 5.4 For mobile beverage (`/for/mobile-beverage`)

- Vertical use-case page: coffee carts · mobile espresso · mobile bartenders.
- Operator-language copy, day-in-the-life task-flow, real screenshots.
- Square's proven vertical-landing-page play.

### 5.5 Features (`/features`)

- Organized by the operator's task-flow (Book → Propose → Invoice → Event-day →
  Drops), **not** by capability list. Each with a real product visual and the role
  it serves. Honors [[design-no-block-stacks]] and the `screen-composition` rule.

### 5.6 Stories (`/stories`)

- `ProofWall` at full size — but **v1 has no stories yet**, so this page ships in the
  founder-honest empty state (§7): the "who we built it with" frame + guarantee +
  trust primitives. If v1 scope must shrink, this page can defer behind a redirect to
  `/about` until the first real stories land. As stories arrive: ordinary local
  operators — cart, city, face, one hard number, "gigs booked / orders filled." No
  follower counts.

### 5.7 About / Our Why (`/about`)

- The subscription-only, no-cut philosophy as brand: **"You're a business, not a
  gig worker."** Names the incumbent's per-order fee as *taking from you*, not "a
  cost." Founder honesty; company legitimacy signals.

### 5.8 Resources (`/resources`) — thin v1

- Blog seed for SEO ("how to price your cart"). Ships minimal, grows later. Cut
  first if v1 scope must shrink.

## 6. The centerpiece — phased

**v1 (ships now — "great" tier, near-zero risk):**
- `FeeAutopsy` calculator: operator's own dollar figure, client-side math.
- `StorePreview`: typed cart-name → instant live, styled, fee-free BrewTrax page
  using the real public-page/drops components.

**Fast-follow (spike-gated — "category-defining" tier, hypothesis):**
- **Full Live Mirror:** paste a Hot Plate / Instagram / Square link → scrape the
  public drops + prices → render the operator's *actual* store, fee-free, with an
  exact (non-estimated) fee autopsy. CTA "Claim this page."

**This is a hypothesis, not a committed feature.** Before it is planned or promised,
a feasibility spike must resolve: (a) scrape robustness/fragility across Hot
Plate/IG/Square markup; (b) **Terms-of-Service and legal review** of scraping
third-party storefronts; (c) rendering-fidelity and abuse/rate-limit concerns. If
the spike fails any gate, v1's named-preview + calculator stands as the shipped
centerpiece (captures ~70% of the emotional payload).

## 7. Empty / edge states (hard gate: no blank states)

- **Proof Wall, 0 operators:** founder-honest "we're new — here's who we built it
  with" + named design-partner + a concrete guarantee, instead of a fabricated or
  lonely single quote (a lone anonymous quote reads as hiding thinness).
- **Proof Wall, many:** cards → compact list/logo strip as the roster grows.
- **StorePreview, empty input:** pre-fill a tasteful sample cart so the control is
  never a blank void; live-update as they type.
- **FeeAutopsy, zero input:** sensible defaults pre-set (a typical cart), never a
  $0/blank result.

## 8. Hard gates (block merge)

- **WCAG 2.2 AA** — 4.5:1 body, 3:1 large/UI; target size ≥24×24px (≥44px touch).
  Re-checked on every palette change.
- **Dark mode** and **`prefers-reduced-motion`** — table stakes.
- **No blank empty states** (§7).
- **Real product visuals** — the hero and feature shots use real product surfaces;
  no placeholder ships.
- **CTA microcopy** — every `Start free` de-risks the click ("no card · minutes").
- **≤2-field signup handoff.**
- **Client-facing craft parity** — the public store preview / any emailed or public
  artifact meets the same craft bar as in-app screens.
- **Perceived-instant** — autopsy/preview update <100ms (client-side); optimistic UI.

## 9. Visual system

- **Palette:** warm craft — copper/brown/cream primary with a moss-green secondary
  (reads artisan, not fintech; aligns with the production moss/copper direction in
  [[design-system-sync-status]]). BrewTrax accent `#6b3410`–`#78350f` family.
  Restraint *is* the differentiated aesthetic — the site should feel built by
  another operator who gets it, not by a venture-funded platform.
- **Type:** Inter (matches production).
- **Cut (Rams/Tufte):** generic 4-even-step "how it works" row, lone testimonial
  card, competitor logo-soup "patchwork" section, stock SaaS hero illustration.
  Their pixels go to *one real number about the operator's money* and *their own
  craft shown back to them*.

## 10. Out of scope (v1)

- Full scrape-Mirror (spike-gated, §6).
- SMS announcements (drops increment 2 elsewhere).
- Resources/blog content beyond a seed.
- Multi-brand generalization of the site beyond BrewTrax (parameterize where cheap;
  don't build the abstraction speculatively — YAGNI).

## 11. Open questions for the plan

1. ~~Subscription price point to display on Pricing~~ — **RESOLVED: three tiers
   $39 / $79 / $149, $79 anchored as most-popular.** Tier names + per-tier feature
   split still to finalize in the plan; 0% per-order applies to all tiers.
2. ~~Operator stories~~ — **RESOLVED: none yet. Proof Wall + Stories page ship in
   the founder-honest empty state (§7), not with fabricated or lonely single
   testimonials.** Replace social proof with the "we're new — here's who we built it
   with" frame + a concrete guarantee, and lean on trust primitives (Stripe/security
   badge, export-anytime, no-contract) instead. Swap in real named stories as they
   arrive, keeping the anchor operator's real name out of committed docs unless
   cleared ([[love-brew-hotplate-context]]).
3. ~~Domain/hosting~~ — **RESOLVED: the marketing site is served at `brewtrax.com`**
   (see §4); every signup CTA hands off to the app origin.
4. Feasibility-spike owner + timebox for the Mirror.

---

**Related:** [[drops-online-ordering-status]], [[traxevent-monetization-decision]],
[[love-brew-hotplate-context]], [[eventtrax-positioning-source]],
[[design-no-block-stacks]], [[design-system-sync-status]].
