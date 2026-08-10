# Public intake form — design

Date: 2026-08-08
Status: approved

## Problem

The pipeline has no front door. Every opportunity is hand-keyed by an operator;
prospective customers have no way to reach an org through the product. The
roadmap's hard prerequisite: the repo has zero rate limiting or bot protection,
and any public write endpoint must solve that first.

This increment ships a public, tokenized lead-capture form that creates a
Customer + Opportunity at stage `inquiry`, logs a `form` activity event, and
emails the org owner — plus the reusable rate-limit seam the rest of the
public surface can adopt later.

## Decisions (confirmed 2026-08-08)

1. **Tokenized link** — `traxevent.com/inquire/[token]`, matching the existing
   proposal/invoice/portal token pattern. Not org-slug URLs (enumerable, not
   rotatable).
2. **Invisible bot layers** — honeypot + minimum-fill-time + Firestore-backed
   rate limiting. No Turnstile/CAPTCHA in this increment; token rotation is the
   escape hatch.
3. **Fixed field set** — name*, email*, phone, event type, event date, guest
   count, message. No builder UI; deliberately distinct from the
   event-registration forms engine (per CRM v1 spec).
4. **Owner email notification** via Resend, plus the activity event.
5. **Server action endpoint** — `actions/intake-public.ts`, consistent with
   every existing public flow.
6. **Email is required** — without it `findOrCreateCustomerCore` cannot dedup
   (every submission would mint a duplicate customer) and the org cannot reply
   in writing. Phone stays optional.

## Token model

- New optional `intake_token` field on the org doc (`orgs/{orgId}`), 48-hex
  from the existing `generateAccessToken()` (`lib/tokens.ts`).
- Minted lazily by `ensureIntakeToken(orgId)` the first time an admin opens the
  Intake link dialog. `regenerateIntakeToken(orgId)` replaces it; the old link
  404s immediately. Both live in a new authed `actions/intake.ts`, guarded by
  `assertOrgAdmin`.
- Public lookup: equality query `orgs.where('intake_token', '==', token)
  .limit(1)` on the top-level collection — automatic single-field index, no
  `firestore.indexes.json` change.

## Routes and UI

### Public form — `app/(public)/inquire/[token]/page.tsx`

Server component: resolves token → org; unknown token → `notFound()`. Renders
org name above a client form component (`components/public/IntakeForm.tsx`)
following the `NewOpportunityForm` pattern: one `useState` per field, plain
shadcn `Input`/`Label`, `try/catch` into an `aria-live="polite"` error region.
On success the form swaps to an inline thank-you panel ("Thanks — {org name}
will get back to you soon."). `params` is a Promise (Next 16) — `await` it.

Hidden honeypot field (visually hidden text input with an attractive name like
`website`); mount timestamp kept in state to compute `elapsedMs` at submit.

### Link management — pipeline page

Admin-only "Intake link" dialog reachable from the pipeline (Opportunities)
page header. Shows the full URL with Copy and Open buttons, and Regenerate
behind a confirm ("The current link will stop working."). Calls
`ensureIntakeToken` on open, `regenerateIntakeToken` on confirm.

## Submission flow — `submitIntake(token, input, elapsedMs)`

In `actions/intake-public.ts` (`'use server'`; async function exports only —
no type re-exports, see `nextjs-use-server-no-type-reexport`).

1. Resolve token → org. Invalid → generic error ("This form is no longer
   available.").
2. **Honeypot / time gate:** honeypot non-empty or `elapsedMs < 3000` → return
   fake success, write nothing. (Client-supplied `elapsedMs` is trivially
   forgeable; it is a speed bump for dumb bots. The honeypot and rate limits
   carry the real load.)
3. **Rate limit** (see below). Exceeded → generic "Too many requests — please
   try again later."
4. **Validate** (hand-rolled, repo convention, hard caps on everything):
   - `name`: required, trimmed, ≤200 chars.
   - `email`: required, ≤200, light format check (`x@y.z` shape, no RFC
     pedantry).
   - `phone`, `event_type`: optional, ≤200.
   - `message`: optional, ≤2000 → stored as lead `notes`.
   - `event_date`: optional, must parse as ISO `YYYY-MM-DD`.
   - `guest_count`: optional, integer 0–100000.
5. **Write:**
   - `findOrCreateCustomerCore(orgId, {name, email, phone})` — already
     transaction-hardened for concurrent public submissions.
   - Create lead at stage `inquiry` via new guard-free `createLeadCore` in
     `lib/crm/leads.ts` (conditional-spread idiom so blank optionals are never
     written; sets `customer_id`). The existing `createLead` action delegates
     to the core after `assertOrgAdmin` — behavior-preserving extraction.
6. **Activity:** `logActivity` with `kind: 'form'` (first writer for the
   existing union member), `parent_type: 'lead'` — best-effort, never fails
   the write.
7. **Email owner** (best-effort, `.catch` swallowed): Resend summary of the
   submission linking to the opportunity. All interpolated values pass through
   a new `escapeHtml` helper in `lib/email.ts` — this is the first
   attacker-supplied content to flow through the email templates, which
   currently escape nothing.
8. Return `{ok: true}` only. No ids, no org internals, no raw error text from
   internals.

### Coordination with in-flight `claude/customer-page` branch

That branch adds a `customer_id` fast-path to `createLead`. Intake always takes
the email-dedup path and never passes `customer_id`, and the `createLeadCore`
extraction keeps the admin action's behavior identical — merge order does not
matter, but whichever lands second reconciles the extraction mechanically.

## Rate limiting — `lib/rate-limit.ts` (reusable seam)

- `checkRateLimit(key, {limit, windowMs})` → `{allowed: boolean}` — fixed-window
  transactional counter in top-level `rate_limits/{key}` docs
  (`{count, window_start}`), admin SDK only (default-deny rules already block
  client access; no rules change).
- Window rollover resets the counter in the same transaction. Doc ids are the
  keys; no TTL cleanup in this increment (bounded cardinality, tiny docs).
- Intake keys:
  - `intake:ip:{sha256(ip)}` — 5 per hour. IP from `headers()`
    `x-forwarded-for` first hop; only the hash is ever stored.
  - `intake:org:{orgId}` — 30 per hour, so one scraped link cannot flood a
    pipeline or drain email quota.
- **Failure posture:** limit exceeded → deny. Rate-limiter infrastructure error
  → allow (if Firestore is down everything is down; availability wins) —
  wrapped so an rate-limit exception can never fail a legitimate submission.
- Future adopters: `createRegistration` (currently unthrottled), public
  proposal/portal endpoints.

## Error handling

- All user-facing errors are generic strings; internals never leak.
- Honeypot/time-gate hits return indistinguishable fake success.
- Activity log and owner email are best-effort; only validation, rate-limit
  denial, and the customer/lead writes can fail a submission.

## Testing

- `__tests__/actions/intake-public.test.ts` — token resolution (unknown token
  errors), honeypot fake-success writes nothing, time-gate fake-success,
  rate-limit denial, length-cap rejections, email-required, dedup path reuses
  existing customer by `email_lower`, lead created at `inquiry` with
  `customer_id`, activity + email failures don't fail the write.
- `__tests__/lib/rate-limit.test.ts` — under-limit allows, at-limit denies,
  window rollover resets, infra error allows.
- `__tests__/actions/intake.test.ts` — ensure mints once and is idempotent,
  regenerate replaces (old token no longer resolves), both require admin.
- Firebase-admin mocked at module level per existing convention. `next build`
  must pass before the branch is called green.

## Out of scope (deliberate)

- Operator-configurable fields / builder UI.
- Embeddable widget or iframe snippet.
- Brand-domain routing (`brewtrax.com/inquire/...`) — waits on the pre-DNS
  brand-domain decision (ROADMAP).
- Auto-created first task on submission.
- Turnstile/CAPTCHA — add only if spam materializes despite the layers.
- Rate-limit doc TTL/cleanup.
