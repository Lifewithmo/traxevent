# EventTrax Vision — Codebase Audit

**Date:** 2026-08-02
**Audited codebase:** branch `claude/local-vs-online-status-7dd951` @ `25e75d6` (= `main` through Phase 5g **plus** the Phase 6a industry-pack layer).
**Audited against:** [EventTrax positioning source thread](./2026-08-02-eventtrax-positioning-source.md).
**Method:** every capability the thread names was grep-probed across `actions/`, `lib/`, `components/`, `app/`. Findings cite real files.

## Legend

| Mark | Meaning |
|---|---|
| ✅ **Built** | Real implementation exists (action + logic + UI) |
| 🟪 **Declared-only** | A Phase 6a `ModuleId` exists in `lib/industry-packs.ts`, but **no implementation** behind it |
| 🟡 **Partial** | Approximated by an existing feature, not purpose-built |
| ⛔ **Absent** | Nothing in the codebase |

---

## A. The 8 common-denominator questions

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | Who is the customer? | ✅ Built | `actions/leads.ts`, `actions/client-portal.ts`; `Lead`, client records in `lib/types.ts` |
| 2 | What are we providing? | 🟡 Partial | Proposal line items (`actions/proposals.ts`, `ProposalLineItem`). No structured **menu/service catalog** — see §C |
| 3 | When is the event? | ✅ Built | `actions/calendar.ts`, `lib/calendar.ts` |
| 4 | Where is the event? | 🟡 Partial | Location captured on events; no **delivery routing** — `routing` is 🟪 declared-only |
| 5 | Who's working it? | 🟡 Partial | `actions/people.ts`, `actions/assignments.ts`, `EventPerson` (staff/volunteer). Modeled for camp staff/volunteers, not gig crews / second shooters |
| 6 | What equipment or inventory? | 🟪 Declared-only | `inventory` module id in `lib/industry-packs.ts`; **no implementation** |
| 7 | How do we get paid? | ✅ Built | `actions/invoices.ts`, `actions/billing.ts`, Stripe + Connect + payment intents |
| 8 | How do we follow up? | ✅ Built | `actions/communicate.ts`, client portal |

**Score: 4 Built · 3 Partial · 1 Declared-only.** The get-paid / follow-up / when / who-is-customer axis is solid; the what/where/who's-working/inventory axis is where the operational depth is thin.

## B. "Choose your industry" module system

**Phase 6a delivered the toggle layer, not the modules.** `lib/industry-packs.ts` defines packs (`general`, `coffee-cart`, `caterer`, `florist`, `photographer`) that switch modules on per org, and `AdminSidebar` gates nav on them. But the packs reference five **forward-declared** module ids that have no code yet:

| ModuleId | Status | Note |
|---|---|---|
| `catalog` | 🟪 Declared-only | Menus / service catalogs — nothing behind it |
| `inventory` | 🟪 Declared-only | Stock / equipment — nothing behind it |
| `deliverables` | 🟪 Declared-only | Shot lists / recipes / checklists — nothing behind it |
| `routing` | 🟪 Declared-only | Delivery scheduling — nothing behind it |
| `pos` | 🟪 Declared-only | Public-sale mode — nothing behind it |

The other pack modules (`leads`, `clients`, `proposals`, `contracts`, `invoices`, `events`, `registrants`, `vendors`, `calendar`, `reports`) **are** ✅ built — they gate existing, shipped surfaces.

> **Net:** the *mechanism* the thread's signature idea needs now exists; the *industry-specific modules* it lists still don't. A florist pack today shows a florist-labelled subset of the generic CRM nav — not floral recipes.

## C. Per-vertical named deliverables (from the thread)

### Florist
| Item | Status | Evidence |
|---|---|---|
| Floral recipes | ⛔ Absent (🟪 under `deliverables`) | — |
| Delivery schedule | ⛔ Absent (🟪 under `routing`) | — |
| Wedding timeline | 🟡 Partial | `actions/itinerary.ts` exists (event itinerary/timeline builder) |
| Inventory of flowers | 🟪 Declared-only | `inventory` id only |
| Setup checklist | ⛔ Absent (🟪 under `deliverables`) | — |

### Food truck
| Item | Status | Evidence |
|---|---|---|
| Daily menu | ⛔ Absent (🟪 under `catalog`) | — |
| Commissary checklist | ⛔ Absent | — |
| Inventory | 🟪 Declared-only | — |
| Festival calendar | 🟡 Partial | generic `calendar` exists; no festival/public-event mode |
| POS integration | ⛔ Absent (🟪 under `pos`) | — |

### Photographer
| Item | Status | Evidence |
|---|---|---|
| Shot list | ⛔ Absent (🟪 under `deliverables`) | — |
| Timeline | 🟡 Partial | `actions/itinerary.ts` |
| Gallery delivery | ⛔ Absent | no gallery concept in codebase |
| Second shooter | 🟡 Partial | staffing via `EventPerson`/assignments, not gig-crew framed |
| Equipment checklist | ⛔ Absent (🟪 under `deliverables`/`inventory`) | — |

## D. The caterer end-to-end workflow

| Step | Status | Evidence |
|---|---|---|
| Inquiry | ✅ Built | `actions/leads.ts` (`LeadStage: 'inquiry'`) |
| Menu & headcount | ⛔ Absent | no menu/catalog (🟪 `catalog`); headcount not modeled |
| Proposal | ✅ Built | `actions/proposals.ts` |
| Contract | ✅ Built | `actions/contracts.ts` (e-sign) |
| Deposit | 🟡 Partial | no first-class deposit, but invoices support partial payments (`InvoiceStatus 'partial'`, `InvoicePayment[]` in `lib/types.ts`) |
| Staffing | 🟡 Partial | `actions/people.ts` / `assignments.ts` |
| Purchasing & prep | ⛔ Absent | — |
| Equipment loading | ⛔ Absent (🟪 `inventory`) | — |
| Event execution | 🟡 Partial | check-in (`actions/checkins.ts`), itinerary |
| Final invoice | ✅ Built | `actions/invoices.ts` |
| Reporting | ✅ Built | `actions/reports.ts` |

**6 of 11 steps built or partial; the 5 gaps cluster in menu, procurement, and equipment — the operational middle.**

## E. Positioning / terminology gap

The thread's customer is a solo coffee cart; the codebase wears **church-camp DNA**:

- Tenancy `Network (denomination) → Region → Org → Camp` (`lib/types.ts`, `actions/networks.ts`).
- Domain nouns: "registrant", "family/household", "volunteer hours", "check-in manifest".
- The event-type terminology skin (`lib/event-types.ts`) can reskin labels — and Phase 6a packs point at event types — but the built-in event types are all church events (`summer-camp`, `retreat`, `vbs`, `gala`, `mission-trip`). No coffee-cart / caterer / florist event types or skins exist yet.

## F. Net assessment

| Layer | Readiness | Change since the first gap analysis |
|---|---|---|
| Booking → payment **spine** | ~70% | unchanged — was already the shipped Phase 5 vertical |
| Industry **module system** | ~20% (was ~12%) | **Phase 6a added the toggle mechanism**; modules themselves still unbuilt |
| **Positioning** / customer model | wrong target | unchanged — church-camp identity intact |

**What Phase 6a changed:** the "choose your industry → install modules" *plumbing* is real and merged (PR #36). What it did **not** change: not one of the industry-specific modules the thread names (catalog, inventory, deliverables, routing, POS, gallery) exists — they are ids awaiting implementation.

**Highest-leverage next builds (unchanged conclusion, now unblockable):**
1. **Catalog/menu** module → unlocks coffee-cart, caterer, food-truck packs.
2. **Inventory/equipment** module → unlocks rentals, florist, food-truck, DJ.
3. **Deliverables** framework (on the forms engine) → shot lists, floral recipes, checklists.
4. Neutralize church-camp terminology behind the skin; add real vertical event-types.

**Honest bottom line:** the expensive engine (CRM → contract → invoice → portal) is done and now toggle-able per industry, but EventTrax as the thread describes it — an OS with real per-vertical operational modules — is still mostly ahead of us. Phase 6a is the on-ramp, not the destination.
