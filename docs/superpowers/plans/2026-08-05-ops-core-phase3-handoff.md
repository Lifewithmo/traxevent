# Phase 3 Handoff: Operations Screens (Beverage MVP)

What the ops core (merged 2026-08-05) provides and what the screens plan must know.

## APIs the screens consume

- Catalog: `listResources/createResource/updateResource/deleteResource` (actions/resources.ts); `listWorkPackages/create/update/delete` + checklist-template actions (actions/work-packages.ts) — org-level, admin-gated writes.
- Event ops (actions/event-ops.ts, all gated by `assertEventPage(orgId, eventId, 'ops')` unless noted): `getOpsPlan`, `instantiateOpsPlan` (admin), `updateOpsRequirements`, `toggleListItem`, `completeChecklistStep`, `toggleDeadline`, `acknowledgeReview`, `listIssues/createIssue/resolveIssue`, `getCloseout/saveActuals/getCloseoutSummary`, `completeCloseout` (admin).

## Contracts & behaviors screens must respect

- `instantiateOpsPlan` throws `'Ops plan already exists for this event'` — check `getOpsPlan` first; there is no re-instantiate or change-packages path yet (known gap: changing `package_ids` post-instantiation requires design).
- Guest-count changes re-derive the shopping list (checked state carried forward by resource) and set `needs_review`; packing list is untouched. Surface `needs_review` prominently; `acknowledgeReview` clears it.
- Missing packages throw `'Package no longer exists: <id>'` from re-derive and closeout summary — surface as an actionable error, and avoid offering deletion of in-use packages in the catalog UI.
- Execution updates run in Firestore transactions — concurrent staff are safe, but last-write-wins within a step is by design.
- `checklist_template_ids` on a package filters which checklists instantiate (union across packages; empty = all org/pack templates).
- `getTemplatesForOrg` merges built-ins with org templates (same id overrides; new ids append).

## Permissions

- `'ops'` is a real `EventPage` now. Owners/admins pass automatically; staff need an `ops` grant in their `event_access` — the permissions UI must expose it. Existing staff have no grant (deny by default).
- All access is via server actions (admin SDK). If phase 3 ever reads ops data with the client SDK, `firestore.rules` needs a change (event subcollections are currently admin-only).

## Known deferred items (final-review ledger)

- `instantiateOpsPlanCore`'s existence check is get→set, not transactional (acceptable: admin-gated, low concurrency — conscious call, revisit if convert-to-work automates retries).
- change_log unbounded (1MB doc budget shared with checklists/lists) — cap before events accumulate hundreds of edits.
- No `null` channel to clear optional requirement fields (`notes` can be set, never removed).
- Money floats: specify display rounding (margin numbers) in the screens.
- Only `coffee-cart` and `general` have deadline/checklist templates; other packs fall back to `general` — make that visible in the UI.
- Photo evidence is a URL string — needs a storage story (upload → URL) in the screens plan.

## Adjacent workstreams

- Proposals convert-to-work calls `instantiateOpsPlanCore(orgId, eventId, { package_ids, requirements, event_start: Event.event_start, industry_pack_id: org pack, actor_uid })` — idempotency contract in the seam's doc comment (lib/ops/event-ops.ts).
- "Generate final invoice" = wire `getCloseoutSummary` into existing invoicing actions (deliberately not in the core).
