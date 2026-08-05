# Multi-Brand Vertical SaaS + Operations Core — Design

**Date:** 2026-08-05
**Status:** Approved pending user review
**Inputs:** `~/Downloads/eventtrax_operations_analysis.md` (cross-sector operations research), existing industry-pack system (`lib/industry-packs.ts`), positioning source ("OS for booked-job businesses").

## 1. Summary & strategy

TraxEvent becomes one platform serving multiple vertically-branded SaaS products. Each vertical (mobile beverage, catering, floral, entertainment, photography, and later service trades) gets its own brand, domain, marketing site, and campaigns — but all brands run on **one codebase, one Vercel project, one Firebase project, one Stripe account**.

The product resolves the "universal mush vs. five separate apps" tension with: **universal engine, vertical skin.** Users never see generic objects; the florist sees "Recipes," the caterer sees "BEOs," the coffee cart sees "Menu Packages." Same underlying schema.

Decisions made:

- **Branding:** separate brand per vertical (BrewTrax-style), not one master consumer brand. "Trax" suffix is the *default* naming pattern, dropped without guilt when a name fails the say-it-out-loud test. Master brand (TraxEvent) ties the family together for investors/press only.
- **First vertical:** mobile beverage (existing `coffee-cart` pack), per the research — it exercises nearly the whole shared ops engine at the lowest complexity.
- **Target user at launch:** solo operator (research Stage 1). No departments, permissions matrices, dispatch, or multi-warehouse anything.
- **Launch mode:** anchor users available — shape the MVP around their real events before public launch.
- **Build sequencing:** thin shared ops core + beverage skin (Approach A). Universal objects built only to the depth beverage needs; vertical #2 deepens the same objects rather than rewriting.

Explicitly rejected:

- Separate Firebase/Vercel per vertical — 5× ops burden, fragmented auth/billing/migrations, kills the cross-vertical customer, and the benefit (brand isolation) is achievable at the domain layer.
- Beverage-only schema (generalize later) — the research's core finding is that the operational objects are genuinely the same shape across sectors; ignoring that is scheduled rework.
- Full universal engine first — months with no user feedback; the research itself warns against building all five verticals deeply at once.

## 2. Brand & domain architecture

One repo, one Vercel project, one Firebase. The multi-brand layer is a thin extension of the existing pack system.

### Brand registry — `lib/brands.ts`

Structurally parallel to `industry-packs.ts`:

```ts
interface Brand {
  id: string                 // 'brewtrax'
  name: string               // 'BrewTrax'
  domains: string[]          // ['brewtrax.com', 'www.brewtrax.com']
  industryPackId: string     // 'coffee-cart' — pre-selected at signup
  theme: BrandTheme          // logo, palette, favicon
  marketing: BrandMarketing  // headline, copy slots, pricing page config
}
```

A default `traxevent` brand covers the existing root domain, preserving current behavior.

### Hostname routing — `proxy.ts`

Before the existing org-slug subdomain logic: look up the hostname in the brand registry. On match, rewrite to brand-scoped marketing routes (`/(marketing)/[brandId]/…`) so each brand serves its own landing, pricing, and signup pages. Org subdomains (`{org}.traxevent.com`) continue to work unchanged.

**v1 scope decision:** brands own *acquisition* (marketing + signup). The logged-in app stays on the TraxEvent domain family. Per-brand app domains are a later cosmetic step, not a re-architecture.

### Signup & attribution

- Brand signup routes pass `industryPackId` into onboarding; a BrewTrax signup lands in an org pre-configured as a coffee-cart workspace with beverage terminology.
- `Org` gains `brand_id?: string` for per-brand revenue/conversion reporting.
- Stripe remains one account; brand is metadata on the org.

### Launching a new brand

One entry in `brands.ts` + `vercel domains add <domain>` + marketing copy. Zero infra work. This same mechanism supports horizontal product brands (see §5), not just verticals.

### Naming system

Default pattern: one punchy native trade word + "trax" (BrewTrax, MowTrax, GigTrax, BloomTrax). Two-part test: (1) say it aloud without stumbling, (2) the word is the trade's own word, not a description. When no clean compound exists, use a standalone name with a quiet "a TraxEvent company" tie. Trademark (USPTO) check before any brand goes live; known conflict examples to avoid: CaterTrax, TimeTrax, MIXTRAX, SawTrax, KeyTrax, OPSTrax.

Domain portfolio (purchased/purchasing 2026-08): coffeetrax, brewtrax, pourtrax, cheftrax, petaltrax, weddingtrax, boothtrax, fototrax, bpmtrax, painttrax, mowtrax, ducttrax, plumbertrax, shingletrax (± fandbtrax). Speculative holds are 1-year auto-renew registrations; only launched brands get further investment.

## 3. Shared operations data model

Five universal objects, all shared code, all skinned by pack terminology. Each is sized to beverage-solo depth; deeper versions from the research are deliberately deferred.

### 3.1 Work Package (org-level catalog — keystone object)

What the customer buys plus what it takes to deliver. Collection `work_packages`:

- Name, description, customer-facing scope, price
- Line items referencing resources:
  - consumables with per-guest quantity formulas (e.g. "0.75 oz beans × guests")
  - equipment (reusable/serialized resources)
  - labor role stubs (recorded, not scheduled — staffing is deferred)
- Setup/teardown durations, lead times
- Attached checklist templates

Pack terminology: coffee-cart = "Menu Packages"; catering = "Menus/BEOs"; floral = "Recipes"; entertainment = "Gig Packages."

### 3.2 Resource (org-level)

One collection with `kind: 'consumable' | 'reusable' | 'serialized'` (beans vs. bulk cups vs. Espresso Machine 02). v1 tracks **per-event needs** (shopping/packing lists) only — no warehouse quantities, availability windows, or reservation conflicts (rental-vertical depth, deferred).

### 3.3 Event Requirements + derived ops plan (on the existing event)

On proposal acceptance, its packages attach to the event and the engine derives downstream artifacts:

- **Requirements:** guest count, service window, site needs (power/water/ice/parking/access), package selections. Every edit writes a change-log entry (who/what/when) and flags derived items **"needs review"** — changes propagate, never silently.
- **Deadlines:** generated backward from event date via per-pack offset templates (ingredient-order cutoff, permit check, final-payment due). Rendered as dated tasks.
- **Checklists:** instantiated from templates (prep, load-out, setup, service-close, closeout). Mobile-friendly execution; steps optionally capture evidence (photo/number). This is the procedures system v1 — no SOP versioning/training yet.
- **Shopping & packing lists:** computed from packages × guest count.

### 3.4 Issue (on the event)

Typed record: type, severity, note, status (open/resolved). Deliberately more than a comment, deliberately less than an escalation matrix.

### 3.5 Closeout (on the event)

Planned vs. actual: ingredients used, hours, tips/sales, waste → real event margin. Triggers final invoice through the existing invoicing system. An event is not "complete" until closeout is done.

### The chain

Package → resources → lists/deadlines/checklists → execution → closeout → invoice — the research's operating chain, with staffing, dispatch, purchasing aggregation, and warehouse inventory left as stubs (mirroring the forward-declared `ModuleId`s).

## 4. Beverage MVP scope (BrewTrax launch)

The `coffee-cart` pack's forward-declared `catalog` and `inventory` modules become real; nav uses beverage terminology.

1. **Menu Packages** (`/[orgSlug]/packages`, the `catalog` module): build packages ("Espresso Bar — up to 100 guests") with drinks, consumable formulas, equipment, durations, price. Packages flow into the existing proposal flow.
2. **Event Ops screen** (new tab on the event — the heart): readiness header (countdown, % complete, overdue flags); requirements card with change log; auto-generated deadline list; computed shopping list (checkable, printable); packing/equipment checklist; runnable checklists (phone-friendly, optional photo evidence); issue capture.
3. **Compliance tracker** (org-level, thin): documents with expiry dates (permit, insurance); expiring docs warn on upcoming events. Org-configurable list; no jurisdiction engine.
4. **Closeout screen:** guided actuals entry → margin vs. plan → "generate final invoice" into existing invoicing.

### Explicitly deferred (stubs stay stubbed)

POS/Square integration, staffing & scheduling, purchasing aggregation across events, routing/dispatch, warehouse inventory & reservations, SOP versioning/training, department views, escalation workflows, jurisdiction-aware compliance.

## 5. CRM standalone play (supported, deliberately later)

The sales side (leads → proposals → contracts → invoices → payments) is complete enough to stand alone. In this architecture that is **a brand entry + a sales-only pack** (existing modules minus ops) — no new build. Deliberately not launched now: the horizontal CRM market (HoneyBook, Dubsado, 17hats) is where the vertical edge disappears, and each live brand costs marketing attention. Strategic value: a downsell/on-ramp — sign up for booking tools, upgrade into a vertical ops pack later. Revisit after BrewTrax proves the model.

## 6. Build order

1. **Brand layer:** `lib/brands.ts`, proxy hostname→brand mapping, brand-scoped marketing/signup routes, `Org.brand_id`.
2. **Ops core:** work packages, resources, requirements + change log, derivation engine (deadlines, lists, checklist instantiation), issues, closeout model.
3. **Beverage MVP screens:** packages module, event-ops tab, compliance tracker, closeout flow.
4. **Anchor-user beta on BrewTrax:** real events end-to-end; iterate on derivation formulas and checklist templates.
5. **Public BrewTrax launch**, then vertical #2 (catering) deepens the same objects.

Each step is its own implementation plan; this spec decomposes into at least three plans (brand layer, ops core, beverage screens).

## 7. Risks & mitigations

- **Derivation complexity creep** — resource formulas could balloon into a rules engine. v1 formulas are simple per-guest linear math; anything conditional waits for evidence from anchor users.
- **Change-flag noise** — "needs review" on every edit could train users to ignore flags. Flag only derived artifacts materially affected (quantity/date changes), batch notifications.
- **Brand sprawl before product proof** — many owned domains invite premature launches. Rule: exactly one live brand until BrewTrax has paying users; domains are options, not commitments.
- **Universal-object leakage into UX** — if generic terms show up in vertical UIs, the "built for me" promise breaks. Terminology comes from the pack/event-type layer everywhere; no shared noun renders untranslated.
- **Trademark exposure** — every brand name gets a USPTO search before going live (registrable ≠ usable; see CaterTrax).

## 8. Success criteria

- A new vertical brand can go from owned domain to live landing + pack-preselected signup in under a day of work.
- An anchor beverage user runs a real event start-to-finish (package → proposal → ops screen → event day checklists → closeout → invoice) without leaving the product.
- Closeout produces a believable per-event margin from actuals.
- Zero additional Firebase/Vercel projects exist.
