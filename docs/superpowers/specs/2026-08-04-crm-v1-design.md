# CRM V1 — Design

**Date:** 2026-08-04
**Status:** approved in brainstorming; feeds the CRM V1 implementation plan.

## Vision

A CRM whose one job is to **make it hard to forget a customer** — simple and intuitive enough for a solo operator, built on the "booked-job business" positioning. The organizing rule:

> **Every open opportunity must have exactly one of: a scheduled next action, a clear waiting status, or a closed outcome.** The system surfaces anything that has none, so nothing rots in a forgotten list.

Enforcement is **surfaced, not blocking** — the Today screen nags; it never puts a modal in your way.

## Approach: evolve the existing CRM in place

TraxEvent already ships a Phase-5 CRM: `Lead` (stages `inquiry → consultation → proposal → booked → delivered`) plus Proposals, Contracts, Invoices, Vendors, and a token client portal. V1 **evolves** this rather than rebuilding:

- The existing `Lead` becomes the **Opportunity** (rename + extend).
- A new first-class **Customer** entity is introduced; opportunities belong to a customer.
- Proposals / Contracts / Invoices / Vendors stay as-is, attached to an opportunity.
- "Business account" = the existing tenant `Org` (built). "Users" = existing `OrgMember`s (built). No new tenancy work.

## Data model

New and evolved entities (Firestore, under `orgs/{orgId}/…`):

| Entity | Status | Shape (key fields) |
|---|---|---|
| **Customer** | new | `id, name, company?, email?, phone?, tags[], notes?, created_at, updated_at` |
| **Opportunity** | evolved `Lead` | `id, customer_id (→ Customer), title, stage, value?, event_date?, waiting? {reason, follow_up_date?}, tags[], created_at, updated_at` |
| **Task** | new | `id, opportunity_id, title, due_date?, done, done_at?, created_at` |
| **Note** | new | `id, parent_type ('customer'|'opportunity'), parent_id, body, created_at` |
| **ActivityEvent** | new | `id, parent_type, parent_id, kind ('stage'|'task'|'note'|'email'|'form'|'created'), summary, created_at` |
| Proposal / Contract / Invoice / Vendor | existing | already keyed by `lead_id` → now the opportunity id; unchanged otherwise |

**Tags** are plain string arrays (`tags: string[]`) on Customer and Opportunity — no separate Tag entity. An org-level distinct-tag list is derived for autocomplete. (A managed tag vocabulary with colors/rename is a later nicety; free strings keep V1 simple for a solo operator.)

Relationships: **Customer → many Opportunities → many (Tasks, Notes, ActivityEvents) + attached Proposals/Invoices/Contracts/Vendors.**

**Opportunity stage** (the pipeline): three **open** stages `inquiry → consultation → proposal`, then two **closed** outcomes — `closed_won` and `closed_lost` (displayed "Closed Won" / "Closed Lost"). (This replaces the old `Lead` stages; the old `booked`/`delivered` were post-sale operations, which belong to the Event/operations side, out of V1 CRM scope — `closed_won` is the booking.)

### The discipline mechanic (derived, not a stored flag)

An open opportunity's "health" is **derived** each render:
- **Active** — has ≥1 incomplete task with a `due_date`. The soonest such task is its **next action**.
- **Waiting** — `waiting` is set (reason + optional `follow_up_date`). When `follow_up_date` arrives, it auto-becomes a next action (a task is created / surfaced).
- **Closed** — stage is `closed_won` or `closed_lost`.
- **Needs attention** — open (stage `inquiry`/`consultation`/`proposal`), not waiting, and no dated incomplete task. These are the orphans the Today screen surfaces.

**Tasks and "next actions" are one system.** A task belongs to an opportunity; the opportunity's soonest incomplete dated task *is* its next action. All incomplete tasks across all opportunities feed the Today to-do list. Tasks stay attached through every stage.

## Screens

1. **Today** (home) — three metric tiles (tasks due, needs attention count, open pipeline value); a **Needs attention** list (orphan opportunities, each with one-click *Add next step* / *Mark waiting*); a **Due today / overdue** task list (each tagged with its customer + opportunity); a **Waiting on** list (blocked deals + how long quiet). Validated by mockup.
2. **Opportunity detail** — a **compact contact card** (top-right: avatar, name, company, quick call/email/expand — never dominates the page); a prominent **next-action banner**; a **Tasks** column and an **Activity** timeline sharing the main space; **attached Proposal/Invoice/Contract** chips at the bottom. Validated by mockup.
3. **Customer detail** — the customer's contact info, tags, notes, and the roll-up of *all* their opportunities (open + past) with total/last-contact, so repeat business is never re-keyed.
4. **Board** — kanban by stage (`inquiry → consultation → proposal`, with `closed_won` / `closed_lost` as outcome columns or a card-menu action); cards show customer, value, and a small colored dot for health (active / waiting / needs-attention); drag to change stage.
5. **Smart views** — saved filter presets over opportunities (built-ins: *Needs attention*, *Waiting on*, *Due this week*, *Booked this month*; plus user-saved filters by stage / tag / value / date).
6. **Basic intake form** — a public, tokenized lead-capture form that creates a Customer + Opportunity (+ optional first task) and logs a `form` activity event. Distinct from the event-registration forms engine.

All screens are **mobile-responsive** (single-column stacking; the contact card stays compact and moves to the top on narrow screens).

## Notifications (V1, minimal)

Email (via the existing Resend integration): **new intake-form submission** → notify the owner; **task due today / overdue** → a lightweight reminder. The richer *daily owner summary* and *AI follow-up drafting* are V1.5, out of scope here.

## Explicitly out of scope (later versions)

- **V1.5:** Gmail/Outlook + Google/Microsoft calendar sync, simple automations, email templates, spreadsheet import, daily owner summary, AI follow-up drafting.
- **V2:** SMS, QuickBooks, customer portal (beyond the existing token portal), advanced permissions, public API, multiple locations, custom dashboards, deeper industry templates.

## Migration (pre-launch, no real data at risk)

Existing `Lead` docs carry `name / email / organization` inline. Migration: for each org, create a `Customer` from each lead's contact fields (dedup by email/name), rename the `leads` collection concept to `opportunities` with `customer_id` set, and re-point the `lead_id` references on proposals/invoices/contracts/vendors to the opportunity id. Because the deployment is pre-launch, this is a mechanical reshape + reseed, not a live migration.

## Recommended build order (for the plan)

Ship a **walking skeleton** first, then layer:

1. **Core model + migration:** Customer, Opportunity (from Lead), Task, Note, ActivityEvent, Tag; migrate existing leads.
2. **Opportunity detail** (compact contact card, next-action banner, tasks, activity, attached docs).
3. **Today dashboard** (the discipline mechanic: needs-attention, due-today, waiting-on).
4. **Customer detail** (repeat-business roll-up).
5. **Board** + **Smart views**.
6. **Intake form** + **email notifications**.

Each step is independently shippable and green.

## Non-goals / principles

- **Restraint:** one clear action per view; quiet surfaces; dense bordered rows, not card-soup. Simple enough for a solo operator.
- **Reuse:** do not duplicate the existing Proposal/Invoice/Contract/Vendor code — attach to the opportunity.
- **Derived health, not stored flags:** the active/waiting/needs-attention state is computed, so it can never drift out of sync with the underlying tasks.
