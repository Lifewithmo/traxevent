# Customer Page Completion — Design

**Date:** 2026-08-08
**Branch:** `claude/customer-page` (worktree `.claude/worktrees/claude+customer-page`, off main 8f2528d)
**Origin:** audit of the built customer page against the CRM V1 design
(`2026-08-04-crm-v1-design.md` §Screens.3: *"contact info, tags, notes, and the
roll-up of all their opportunities (open + past) with total/last-contact, so
repeat business is never re-keyed"*). Contact info, notes, and the opportunity
roll-up shipped to spec; this increment closes the three gaps and one dedup
weakness found in the audit.

## Scope — four pieces

1. New opportunity from the customer page (repeat business, zero re-key)
2. Customer typeahead in the pipeline's new-opportunity form (dedup fix)
3. Real last-contact derivation (replaces "last opportunity update")
4. Tag editing with autocomplete (first tag editor in the app)

Decisions 1 and 2 user-confirmed 2026-08-08 (dialog on customer page; explicit
typeahead over name-fallback dedup). Design approved 2026-08-08.

## 1. New opportunity from the customer page

**UX.** A `New opportunity` button in the customer-page header opens a dialog
containing `NewOpportunityForm` in a new *linked* mode: contact fields
(name/email/phone/organization) are absent, replaced by a static
"For {customer.name}" line. All other fields (title, stage, event type/date,
value, guest count, notes) unchanged. On success: close, `router.refresh()`.

**Server seam.** `CreateLeadInput` gains `customer_id?: string`. In
`createLead`:

- `customer_id` present → load the customer via `customersRef(orgId)` (org-scoped,
  so a cross-org id can never resolve); throw `'Customer not found'` if missing.
  Skip `findOrCreateCustomerCore`. Copy the customer's contact snapshot onto the
  lead: `name` ← customer.name, and `email`/`phone`/`organization` ← customer
  email/phone/company when present. `input.name` is not required in this mode —
  the customer supplies it.
- `customer_id` absent → exactly today's behavior (find-or-create by email).

One seam serves both piece 1 (dialog) and piece 2 (typeahead). No change to
`findOrCreateCustomerCore`.

## 2. Customer typeahead in the pipeline form

**Problem.** `findOrCreateCustomerCore` dedups by `email_lower` only; a repeat
client with no email on file mints a duplicate Customer on every new
opportunity.

**Fix.** A `CustomerPicker` combobox at the top of `NewOpportunityForm`'s
standalone mode ("Link to existing customer — optional"). The org's customers
are passed in as a prop by the server page (loaded via `listCustomers`;
client-side substring filter over name/company/email — solo-operator scale, no
server search). Selecting a customer collapses the contact fields to a display
line (same rendering as linked mode) and the form submits with `customer_id`.
Clearing the picker restores free-entry + today's email dedup. Left untouched,
behavior is byte-identical to today.

Not doing: name-fallback dedup (silent false merges are worse than duplicates),
server-side search, merge tooling for existing duplicates.

## 3. Real last contact

**Problem.** `rollupCustomer` derives `lastActivityAt` from opportunity
`updated_at`/`created_at` only. Notes, tasks, emails, and nudges don't move it,
so an actively-tended customer can read as forgotten — inverting the product
thesis.

**Chosen approach: denormalized stamps** (over read-time activity queries,
which cost N queries per page and per index row). `logActivity` already stamps
`last_touch_at` on the lead for every opportunity-parented event, best-effort.
Extend the same stamp to `customersRef(orgId).doc(parent_id)` when
`parent_type === 'customer'` (same best-effort `.catch(() => {})` contract:
telemetry must never fail the business write). `Customer` gains
`last_touch_at?: string`.

`rollupCustomer(leads)` becomes `rollupCustomer(customer, leads)`:

```
lastContactAt = max(
  customer.last_touch_at,
  ...leads.map(l => l.last_touch_at ?? l.updated_at ?? l.created_at),
)
```

Rename the rollup field `lastActivityAt` → `lastContactAt`; tile label
"Last update" → "Last contact". The clients index (`ClientsTable`) shows a
Last contact column — free, since the page already loads every lead and the
customer doc is in hand. Pre-stamp historical data degrades to the
`updated_at`/`created_at` fallback (acceptable: deployment is essentially
pre-launch).

## 4. Tag editing with autocomplete

`TagEditor` in the customer-page header, replacing the read-only badge row:

- Each tag badge gets a remove (×) affordance.
- An inline "Add tag" input with suggestions from the org's distinct tag list,
  filtered as you type; Enter or suggestion-click adds.
- Suggestions prop: computed server-side in the customer page from the union of
  tags across the org's customers and opportunities (`listCustomers` +
  `listLeads` — two extra org-wide reads on the detail page, fine at
  solo-operator scale; no new collection, per the V1 spec's "derived
  distinct-tag list").
- Normalization on save (pure function in `lib/crm/customers.ts`): trim,
  drop empties, dedupe case-insensitively preserving first-seen casing.
- Every edit saves the full `tags` array via `updateCustomer`, which gains
  `tags?: string[]` in `CustomerUpdate` (full-array replace — no incremental
  add/remove ops).

Out of scope: tag editing on opportunities, managed tag vocabulary
(colors/rename), tag filtering on the clients index.

## Error handling

- `createLead` with unknown/foreign `customer_id` → throws `'Customer not found'`
  (org-scoped ref makes foreign ids unresolvable by construction).
- Tag save failures surface in the existing contact-card error pattern
  (`role="alert"` line); the editor re-seeds from server state on refresh.
- `last_touch_at` stamps stay best-effort; a failed stamp loses freshness only,
  never data.

## Testing

- **Pure:** `rollupCustomer` last-contact chain (customer-only touch, lead-only
  touch, fallbacks, empty); tag normalization (trim/empty/case-dedupe).
- **Actions:** `createLead` linked mode — snapshot copy, missing customer
  throws, absent `customer_id` unchanged; `updateCustomer` tags replace;
  `logActivity` customer stamp (and that stamp failure doesn't throw).
- **Components:** `TagEditor` add/remove/suggest; `CustomerPicker`
  select/clear/filter; customer-page dialog renders linked form and omits
  contact fields.

## Non-goals

Merging existing duplicate customers; activity feed on the customer page;
customer archive/delete; index-page tag filters; any opportunity-side tag UI.
