# Sidebar IA Redesign — Flat Sections, Split-Click Rows, Live Job Context

**Date:** 2026-08-15
**Status:** Design approved, not implemented
**Supersedes the IA in:** `docs/superpowers/plans/2026-07-05-business-nav.md`

---

## Problem

The current sidebar ([components/layout/AdminSidebar.tsx](../../../components/layout/AdminSidebar.tsx)) has five groups and a second, entirely separate sidebar that replaces it inside an event. Concretely:

1. **"Quick Links" is a junk drawer.** Calendar, Clients, Events, Today, Registrants share no organizing idea, so nothing can be correctly added to or removed from it.
2. **Today has the lowest prominence and the highest frequency.** It is the only "what do I do now" surface and sits 4th inside that drawer.
3. **Two calendars, no authority.** The sidebar points at `/calendar`; `PipelineSubNav` points at `/leads/calendar`.
4. **Getting paid has no home.** Invoices is a leaf under "Sales Pipeline", Billing (the org's own subscription) is under Settings, and there is no AR or revenue surface.
5. **"Operations" contains no operations.** Vendors, Packages, Forms, Compliance are catalog and setup nouns. Real ops — staffing, loading, run-of-show, closeout — are only reachable from inside an event.
6. **Settings is 9 flat items** conflating business identity, work assets (proposal templates), and administration.
7. **Entering a job means leaving the business.** The org sidebar wholesale swaps out ([AdminSidebar.tsx:334-360](../../../components/layout/AdminSidebar.tsx#L334)). An operator running six jobs loses context on every hop. This is the largest tax in the current IA.

---

## Target IA

Eight top-level rows. Sections collapsed at rest; only the active section is open.

```
Today                                    ← badge: open count
Calendar
Clients
Pipeline    Opportunities · Tasks · Proposals
Events      <today + next 4> · All events · Past · + New event
Money       Invoices · Payments · Reports
Catalog     Packages · Vendors · Forms · Compliance
Settings    Members · Permissions · Billing · Branding ·
            Proposal templates · Public profile ·
            Email domain · Event types · Departments
─────
Sign out
```

**Top trio** (Today, Calendar, Clients) are the destinations opened without a reason — the day, the schedule, the people. They are flat, ungrouped, and always visible. Everything below is opened *with* a reason.

**Registrants** slots between Events and Money when the `registrants` module is enabled. Module gating via the existing `has(module)` helper is preserved throughout.

**`/leads/calendar` is retired.** With Calendar promoted to the second row, the Pipeline sub-item duplicates it. `PipelineSubNav` drops from three tabs to two.

---

## Events section: today + 4

Always exactly 5 event rows. No conditional height.

- Sort by start date ascending, from today forward.
- Take the first 5.
- Each row shows the event name and a date. If the event starts today, the date column reads `Today` instead of a date. That tag is the only special-casing — there is no separate "today" group, no pinning, no expansion.
- Fewer than 5 upcoming events renders fewer rows; nothing else changes.
- Below the 5: `All events`, `Past`, `+ New event`.

Clicking an event row navigates into that job. The Events section then stays open and shows that job's nav (Ops, Teams, Itinerary, Closeout, and any module-gated pages) in place of the 5-event list, with `All events` at the bottom to get back. **The business nav never swaps out.** This is the fix for problem 7 and the core of the design.

---

## Split-click rows

Every parent row with children uses two controls:

- **Label** → `<a>`, navigates to that section's landing page.
- **Chevron** → `<button aria-expanded>`, toggles the children. Does not navigate.

This is an established pattern (Notion sidebar, GitHub file tree, Figma layers panel), not a novelty.

**Requirements:**
- Two focusable controls per parent row; one extra tab stop per section is expected and correct.
- The chevron glyph is 12px but its hit area must be ≥24px square, or it is unhittable on touch.
- Consider revealing the chevron on hover (Notion's approach) to signal that the row halves behave differently.

**Every parent row must have a landing page** for this to hold. Two exist today; three must be built (below). Uniform behavior across all five parents was chosen deliberately over mixing split-click and whole-row-toggle.

---

## New landing pages

These exist so every parent label has a destination. Each should answer a real question rather than being a link menu — a thin overview page is the failure mode to avoid here.

### `/[orgSlug]/money`
The highest-value of the three. Answers "how's cash looking?"
- Outstanding total, overdue total with count, paid this month.
- Aging buckets (current / 30 / 60 / 90+).
- Recent payments.
- Deep links to Invoices, Payments, Reports.
- Sidebar badge sources from the overdue count.

### `/[orgSlug]/catalog`
Answers "is my catalog in good shape?"
- Package count, most-used packages by proposal attach rate.
- Vendors with expiring or missing insurance/compliance docs — this is the one genuinely urgent thing in the section.
- Forms with unreviewed submissions.
- Deep links to Packages, Vendors, Forms, Compliance.

### `/[orgSlug]/settings`
Answers "is my business set up correctly?"
- Org identity summary (name, branding, public profile status, email domain verification state).
- Team: member count, pending invitations.
- Plan and billing status.
- Setup completeness — which of the 9 settings areas are unconfigured.
- Deep links to all 9 existing settings routes, which are unchanged.

---

## What is not changing

- All existing routes remain. This is nav and three new pages, not a route migration.
- Module gating (`ModuleId`, `has()`), terminology (`Terminology`), and `allowedEventPages` filtering all carry over unchanged.
- The collapsed icon rail is preserved; parents show their icon only, chevrons are suppressed.
- Events is **not** renamed to Jobs. That rename has merit given the positioning thesis (businesses book *jobs*), but it touches `ModuleId`, routes, and terminology config, and should be a deliberate separate decision.

---

## Open questions

- **Ordering of Today vs Calendar** is inferred from code and the positioning doc, not measured. One real BrewTrax week of usage would settle it.
- **Job switching frequency.** If hopping between two live jobs in a day turns out to be common, the answer is a job switcher in the page header next to the breadcrumb — not a pinned sidebar list, which was explicitly rejected as clutter.
- **Sidebar height** with all of Settings expanded (9 children) may warrant sub-grouping into Business / Team / Account.
