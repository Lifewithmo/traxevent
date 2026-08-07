# BrewTrax Demo Seed Script — Design

**Date:** 2026-08-06
**Status:** approved in brainstorming; feeds the demo seed implementation plan.

## Context

There is no way to stand up a populated tenant today. Every screen — pipeline, proposals, invoice aging, ops readiness, reports — is empty until someone clicks through the product creating records by hand. That blocks two concrete needs:

1. **Presentation.** A live walkthrough of BrewTrax (mobile beverage, the first vertical launch) needs a tenant that already looks like a real, running business.
2. **Test.** Manual verification of a screen needs data in the states that screen is about — an overdue invoice, a stalled lead, a partly-complete ops checklist.

This design covers one script that serves both. It is a **demo/dev tool, not a migration**: it does not run at launch, it does not touch customer data, and it is scoped so that it structurally cannot.

## Goals

- One command produces a complete, believable BrewTrax tenant.
- Re-runnable. Running it twice is not a hazard and does not accumulate debris.
- Dates are always current-looking, whenever the script is run.
- The delete path cannot be aimed at a real tenant.
- The interesting logic — the data graph and its internal consistency — is unit-testable without Firestore.

## Non-goals

- **Not an emulator setup.** The repo has no Firestore emulator configured; the Admin SDK talks to whatever project `.env.local` points at. Adding emulator support is a larger, separate change.
- **Not volume/load data.** ~10 leads, not 10,000. Query and index performance testing is a different tool.
- **Not the registrant side.** Families, forms, and check-ins are out of scope — BrewTrax is a booked-job business with `key_contacts`, not an attendee roster.

## Environment reality and the safety model

Because writes land in a real Firebase project, safety cannot rest on "be careful." It rests on a structural constraint:

**Every org id the script touches must start with `demo-`.** This is checked before any read, write, or delete. The default is `demo-brewtrax`; `--org-id` can override it but cannot escape the prefix. The recursive delete in `--reset` is scoped to `orgs/{that id}` and its subcollections. There is no code path in which the script deletes a document outside a `demo-`-prefixed org.

Supporting guards:

- Refuse to start if `FIREBASE_PROJECT_ID` is unset.
- Print the resolved project id and org id before the first write, so the operator sees which project they are about to populate.
- A plain run against an org that already exists exits with a message pointing at `--reset`, rather than merging into existing data.
- `--reset` against an org that does not exist is a no-op followed by a normal create, not an error. Reset is the safe default to reach for.

## Entry point

```
npm run seed:demo             # create; fails if demo-brewtrax already exists
npm run seed:demo -- --reset  # delete the demo org, then recreate
```

which maps to `tsx --conditions=react-server scripts/seed-demo.ts`. The `--conditions=react-server` flag is required for the same reason the existing CRM scripts carry it: `server-only`, imported transitively via `lib/firebase-admin`, resolves to its no-throw module under that condition.

Flags: `--reset`, `--org-id=<demo-*>`, `--email=<addr>`, `--password=<pw>`.

## Architecture

Two files, split so that the part worth testing has no I/O.

### `scripts/seed/brewtrax-data.ts` — pure

Exports `buildBrewtraxSeed(today: Date): BrewtraxSeed`. No Firestore import, no clock read, no randomness. Everything is derived from the `today` argument, which makes the whole graph a deterministic function of one input — trivially testable, and the reason the demo never looks stale.

`BrewtraxSeed` is a plain object graph of typed records (`Lead[]`, `Customer[]`, `Event[]`, …) using the interfaces from `lib/types.ts`, with **logical string keys** (`"lead-wedding-oct"`, `"cust-harper"`) for cross-references rather than real document ids. Real ids are assigned by the writer at insert time and resolved through a key→id map. This matters because several core helpers (`createInvoiceCore`, `findOrCreateCustomerCore`) mint their own ids; the pure module cannot know them.

Date fields are expressed as offsets from `today` — upcoming jobs at roughly +1, +2, and +4 weeks; completed jobs at −3 and −8 weeks; invoice due dates positioned to land in specific aging buckets.

### `scripts/seed-demo.ts` — the writer

Parses flags, enforces the guards, resolves or creates the auth user, optionally resets, then walks the seed graph in dependency order: org → member → customers → leads → tasks → events → proposals → invoices → ops. It maintains the key→id map as it goes and prints a summary plus the demo credentials.

## Write paths

Prefer existing guard-free cores; they carry the field cleaning, id scheme, and derived-state logic that the UI depends on:

| Records | Path |
| --- | --- |
| Customers | `findOrCreateCustomerCore` |
| Invoices | `createInvoiceCore` → `issueInvoiceCore` → `recordPaymentCore` |
| Ops plan | `instantiateOpsPlanCore` |
| Work packages | `createWorkPackageCore` |
| Resources | `createResourceCore` |
| Compliance docs | `createComplianceDocCore` |
| Ops issues | `createIssueCore` (+ `resolveIssueCore` for the resolved one) |
| Org, member, leads, tasks, events, proposals | direct typed `adminDb` writes |

Invoice states in particular are driven through the **real transitions** rather than written as finished documents. An invoice that should read "partially paid, 40 days overdue" is created, issued, and then paid against — so its `lifecycle`, `delivery`, computed balance, and aging bucket are whatever the production code says they are. A hand-written document would encode a guess, and would silently drift the first time the derivation changes.

### Accepted tradeoff: direct writes for leads, events, and proposals

`createLead`, `createEvent`, and `createProposal` live in `'use server'` modules behind `assertOrgAdmin`. A script cannot call them — the guard reads cookies and throws outside a request scope. There is no exported core for these three.

The [CRM pre-deploy migration design](2026-08-05-crm-predeploy-migration-design.md) established this codebase's answer to exactly this problem: extract a guard-free `*Core`, leave the action as a thin `assert` + delegate wrapper. This design **deviates** from that precedent and writes typed documents directly instead.

The reason is scope discipline in the other direction. That extraction was justified because migration tooling had to run correctly against live customer data. A demo seeder does not: if a lead it writes drifts from what `createLead` would produce, the cost is a slightly-wrong demo record, caught the next time someone looks at the screen. Restructuring three production action modules as a side effect of adding a dev script is a larger blast radius than the problem warrants.

The mitigation is the type system. The seed builds `Lead`, `Event`, and `Proposal` values against the exported interfaces, so any required-field change breaks the build rather than producing a malformed document. The upgrade path stays open: if a second off-request caller ever needs these, extract the cores then and switch the seeder over — the writer is the only file that would change.

## Demo login

Org membership is keyed by Firebase Auth uid, so the tenant needs a real auth user to be reachable.

The script looks up `--email` (default `demo@brewtrax.test`) via the Admin SDK. If absent it creates the user with `--password` (default `BrewTrax!Demo1`); if present it reuses that uid and leaves the account alone. Either way the uid becomes the org's `owner` member.

`--reset` deletes the org, **not** the auth user. The uid and therefore the credentials are stable across runs, which is what makes it safe to hand the login to someone before a presentation and reset the data afterward.

The default address uses the reserved `.test` TLD: it is a valid auth identifier and cannot receive mail, so no seeded record can accidentally email a real inbox.

The script prints the email, the password, and the org URL on completion.

## Seeded content

**Org** — "BrewTrax Mobile Bar", slug `brewtrax-demo`, `brand_id: 'brewtrax'`, `industry_pack_id: 'coffee-cart'`, `plan: 'business'`, `billing_status: 'active'`. The business plan matters: it unlocks the modules the demo is meant to show.

**CRM** — ~10 leads with every `LeadStage` represented (`inquiry`, `consultation`, `proposal`, `closed_won`, `closed_lost`), each linked to a customer. At least one carries a `waiting` value so the stalled-lead treatment is visible, and several carry open and completed tasks with due dates on both sides of today.

**Proposals** — one `draft`, one `sent` with an expiry a few days out, one `accepted` carrying a deposit. Enough to show the pipeline from build through signature without seeding every status.

**Invoices** — spanning the lifecycle and the aging buckets: one paid in full, one partially paid, one issued and due soon, one issued and 30+ days overdue, one still draft. Between them these cover `current`, `due_soon`, and `d31_60`, which is what makes the AR view worth looking at.

**Events** — 3 upcoming booked jobs at roughly +1, +2, and +4 weeks with `headcount`, `key_contacts`, and itinerary items, written with `status: 'active'`; 2 completed jobs in the past, `status: 'archived'`, so history and reports are not empty. (`createEvent` defaults new events to `draft`; the seed sets status explicitly because a demo tenant whose jobs are all drafts does not read as a running business.)

**Ops** — on the nearest upcoming job: an ops plan instantiated from work packages, with some checklist steps and deadlines already completed so readiness reads as genuinely in-progress rather than 0% or 100%. Plus a small resource inventory spanning `consumable` / `reusable` / `serialized`, one open and one resolved issue, and a compliance doc expiring soon enough to surface in `expiringDocs`.

## Testing

`__tests__/seed-demo.test.ts` runs against `buildBrewtraxSeed` only — no Firestore, no mocks of it. Because the builder is pure and takes `today` as an argument, the tests pass a fixed date and assert on the resulting graph:

- **Stage coverage** — every `LeadStage` appears at least once.
- **Aging coverage** — the invoice set produces every bucket the design claims, computed via the real `lib/invoices` helpers rather than asserted from the fixture's own numbers.
- **Referential integrity** — every task's `lead_id`, every proposal's and invoice's lead reference, and every lead's `customer_id` resolves to a record present in the same graph.
- **Totals** — invoice and proposal totals recomputed with `lib/invoices` and `lib/proposals` helpers match the amounts the fixture claims, so the demo's arithmetic is right on screen.
- **Date relativity** — given two different `today` values, the upcoming/past split holds in both; nothing is hardcoded to 2026.

The writer itself is not unit-tested. Its logic is guard-checking and sequencing against a live Firestore, which a mock would assert tautologically; it is verified by running it.

## Verification

Beyond the unit tests: run the script, confirm it prints the expected project and org, log into the demo account, and confirm the pipeline, AR, calendar, and ops readiness screens all render populated. Then run it again to confirm it refuses, and with `--reset` to confirm it recreates cleanly.
