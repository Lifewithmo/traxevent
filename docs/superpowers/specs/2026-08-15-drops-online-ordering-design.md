# Drops & online ordering — design spec

Date: 2026-08-15
Status: approved direction (approach + fees + channels confirmed by Ryan); spec pending review
Prior art: `docs/strategy/2026-08-08-beacons-parity-feature-request.md` ("Store / checkout
blocks — coordinate with deferred POS"), `lib/industry-packs.ts` (`publicMode`, forward-declared
`'pos'` module), `docs/superpowers/specs/2026-08-08-public-profile-page-design.md`.

## 1. Context and goal

Our anchor coffee-cart operator sells through Hot Plate: scheduled "drops" (pre-order
windows with an open/close time), per-item inventory, pickup windows, an SMS reminder
list, and gift cards. Their link-in-bio — now our `/p/[handle]` page — points at Hot
Plate for ordering. Hot Plate charges their customers 5% + $0.55 per order at checkout
by default (its most-hated trait), offers no in-person sales, and owns the operator's
audience.

**Goal:** replace Hot Plate with a native ordering surface that is owner-first (no
customer-facing platform surcharge), feeds the CRM and (later) closeout, and lays the
data spine for the larger selling ambition: one **Order ledger** where every sale
carries a `channel` — `'drop'` now, `'counter'` (market-day register with QR-to-pay)
and `'tab'` (capped event tabs) in later increments. Selling is framed as part of
delivering a booked job, per the positioning source — this is not "a POS product."

**Decisions taken (Ryan, 2026-08-15):**
1. **Approach A, drops first.** Native build on existing rails; counter/tab follow on
   the same primitives.
2. **Owner-first fees.** No customer-side surcharge, ever. Platform revenue stays the
   existing 1% Stripe application fee absorbed by the org (same seam as registration
   payments and proposal deposits). Marketing wedge: "your customers pay menu price."
3. **Multi-channel announcements, modeled as a set.** Per drop, the operator chooses
   any combination of channels. V1 ships **email** (Resend, wired) + a **social share
   kit** (pre-composed post text + link for IG/FB/TikTok — no platform APIs). **SMS**
   is increment 2 (vendor + A2P 10DLC registration lead time). Social **auto-posting
   via Meta/TikTok APIs** is a later increment (app-review gated). The `channels`
   field and subscriber model are built plural from day one so later channels slot in
   without redesign.

## 2. Scope

**In scope (this increment):**
- `products` — org-scoped sellable retail items: name, price, description, photo.
- `drops` — sales window + pickup windows + per-item stock + status lifecycle.
- Public drop page with cart and guest checkout (Stripe, existing Connect rails).
- Order management for the operator: per-drop order board, mark picked up, aggregated
  prep counts, cancel + refund.
- Refund path (new to the codebase): admin cancel→Stripe refund, `charge.refunded`
  webhook handling. Commerce cannot ship without it.
- Subscribers ("Don't miss the next drop"): email capture on the profile and drop
  pages, stored on Customer, announcement email on drop publish, unsubscribe.
- `/p/[handle]` grows a "Next drop" card + subscribe CTA; calendar gains a `drop` kind.
- Tips at checkout honoring `org.tips_enabled` (excluded from the platform fee).

**Out of scope (named, deliberately):**
- Counter and tab channels (next increments; the Order model reserves them).
- SMS and social API auto-posting (see channels decision above).
- Gift cards, reviews, loyalty, discount codes, waitlists, cart-reservation timers,
  delivery, Venmo/Zelle/cash rails (Stripe `automatic_payment_methods` already gives
  card + Apple/Google Pay).
- Per-order invoices. Orders are their own receipt/ledger; minting invoices per cup
  would pollute sequential invoice numbering. Documented as a decision.
- Recipe/ingredient linkage from products to the ops catalog (activates later with
  the queued recipes increment; products keep an optional seam, §3.1).
- Inventory beyond per-drop stock counts (no on-hand warehouse inventory).
- Sales tax beyond the existing flat manual percent convention.

## 3. Domain model

All new collections are org-scoped subcollections (`orgs/{orgId}/…`), snake_case
fields, ISO-string timestamps, doc `id` mirrored inside the doc, types added to
`lib/types.ts` — matching every existing entity.

### 3.1 Product — `orgs/{orgId}/products`

```
Product {
  id: string                    // randomBytes(8).hex, house convention
  name: string
  description?: string
  price: number                 // dollars, like WorkPackage.price
  photo_url?: string            // Firebase Storage tokenized URL (lib/uploads.ts)
  active: boolean               // soft-hide from new drops
  catalog_ref?: { kind: 'work_package' | 'resource'; id: string }
                                // dormant seam; future recipes/prep-list derivation
  created_at / updated_at
}
```

Products are retail-scale (a $5.50 latte), deliberately distinct from Menu Packages
(event-scale). Floor at zero: name + price is enough to sell. Photo upload reuses
`uploadOrgAsset`-style server action → `product-images/{orgId}/{productId}/…`, 8MB
image cap, tokenized download URL, plain `<img>` (no `next/image` config exists).

### 3.2 Drop — `orgs/{orgId}/drops`

```
Drop {
  id: string
  title: string                 // "Weekend Drop"
  note?: string                 // the thank-you blurb on the page
  status: 'draft' | 'scheduled' | 'open' | 'closed' | 'archived'
  opens_at / closes_at: string  // UTC instants (ISO)
  timezone: string              // IANA, captured from the editor's browser
  pickup: {
    location_name: string       // "SW BOISE"
    address?: string            // display-only
    windows: { id, day: 'YYYY-MM-DD', start: 'HH:mm', end: 'HH:mm',
               slot_minutes?: number }[]
  }
  items: { product_id: string,  // snapshot join at publish; price copied
           name, price, description?, photo_url?,
           stock?: number       // undefined = unlimited
         }[]
  tax_rate?: number             // optional flat percent, manual (house convention)
  channels: ('email' | 'sms' | 'instagram' | 'facebook' | 'tiktok')[]
                                // announcement fan-out chosen per drop; v1 acts on
                                // 'email' and renders a share kit for the socials
  announced_at?: string         // set when the announcement email is sent
  order_seq?: number            // per-drop pickup-number counter (transactional)
  created_at / updated_at
}
```

`status` is stored, but open/closed is *derived* from `opens_at`/`closes_at` at read
time (`dropPhase(drop, now)` pure helper) so nothing needs a cron; `status` records
operator intent (draft/scheduled/archived) and a manual early-close.

Item snapshots (not live product refs) make an in-flight drop immune to product edits
— same snapshot philosophy as proposal templates.

### 3.3 Order — `orgs/{orgId}/orders`

```
Order {
  id: string
  org_id: string                // denormalized for collectionGroup token lookup,
                                // like proposals/invoices
  channel: 'drop'               // union grows: 'counter' | 'tab' (reserved, unbuilt)
  drop_id: string
  status: 'pending' | 'confirmed' | 'picked_up' | 'canceled' | 'refunded'
  expires_at?: string           // pending-hold expiry (§5.3)
  number?: number               // per-drop pickup number, assigned on confirm
  customer_id?: string          // findOrCreateCustomerCore on confirm
  buyer: { name: string, email: string, phone?: string }
  lines: { product_id, name, price, qty }[]      // snapshots
  pickup_window_id: string
  pickup_slot?: string          // 'HH:mm' when slot_minutes set
  subtotal / tax_rate? / tax / tip? / total: number
  payment?: { intent_id: string, paid_at: string }
  refund?: { refund_id: string, amount: number, refunded_at: string, note?: string }
  token: string                 // 48-hex, public status page, house convention
  created_at / updated_at
}
```

No cart entity — the cart lives in client state on the drop page; an Order is born
`pending` at checkout submission (§5.3).

### 3.4 Subscribers — fields on Customer (no new collection)

Per the Beacons-parity doc's suggestion, subscribers land in the CRM:

```
Customer.marketing?: {
  subscribed: boolean
  subscribed_at: string
  source: 'drop_page' | 'profile'
  unsubscribe_token: string     // 48-hex; /unsubscribe/[token] flips subscribed
}
```

Signup calls `findOrCreateCustomerCore` (existing email_lower dedup) then sets
`marketing`. Announcement audience = customers where `marketing.subscribed == true`.

## 4. Public surface

All public reads/writes go through server actions / route handlers on the Admin SDK
with hand-built public projections — the house pattern. `firestore.rules` is
untouched (default-deny covers the new collections for client SDK access).

- **`/p/[handle]`** (existing, `force-dynamic`): gains a "Next drop" card (next
  scheduled/open drop: title, opens/closes countdown text, pickup summary, CTA) and
  the subscribe form. Resolution stays `getOrgByHandle`; drops are only shown for
  orgs with the module enabled.
- **`/p/[handle]/drops/[dropId]`** — the public drop page. Not secret (it is
  marketing, shared on socials), so it rides the handle namespace, org-brand-kit
  themed like proposals (`ProposalTheme`-style CSS custom properties). Layout mirrors
  Hot Plate's proven page: drop card (title/note/pickup/date), menu grid with photos,
  sold-out badges, closed-state banner with subscribe CTA. Public projection strips
  stock *counts* (only `sold_out: boolean` per item) and everything internal.
- **Checkout** happens on the drop page: cart → buyer info (name/email, optional
  phone) → pickup window/slot → tip (if `org.tips_enabled`) → Stripe
  `PaymentElement`, `loadStripe(pk, { stripeAccount })`, exactly the
  `ProposalDepositPayment` pattern including the post-pay "finalizing" poll until the
  webhook lands.
- **`/orders/[token]`** — order status page (confirmation, pickup number, window,
  refund state). Token-resolved via `collectionGroup('orders')`, like invoices.
- **`/unsubscribe/[token]`** — one-click unsubscribe, uniform response.

**Abuse protection:** checkout-intent creation and subscribe both go behind
`lib/rate-limit.ts` (per-IP and per-org keys, same shape as intake) plus the honeypot
field on subscribe. Input caps mirror intake's.

## 5. Payments

### 5.1 Money path

PaymentIntent on the org's connected account (`stripeAccount: org.stripe_account_id`),
`application_fee_amount = round((total − tip) × 1%)` — the existing seam, with tips
excluded from the fee (owner-first; Hot Plate also exempts tips). Metadata:
`{ purpose: 'drop_order', order_id, org_id }`. 400 if the org has no
`stripe_account_id`, same as existing intent routes. New route:
`app/api/payments/drop-order/intent/route.ts`.

Amounts are always server-computed from the drop's item snapshots — client totals are
never trusted (house rule from `computeSelectedTotal`).

Tax: optional flat percent set on the drop (`drop.tax_rate`), applied to subtotal —
the same manual-flat-percent convention proposals and invoices use. No Stripe Tax.

### 5.2 Webhook

`app/api/payments/webhook/route.ts` (existing endpoint, `STRIPE_PAYMENT_WEBHOOK_SECRET`)
adds two cases:

- `payment_intent.succeeded` with `purpose === 'drop_order'` → confirm flow
  (idempotent, keyed on order status): transactionally assign `number` from
  `drop.order_seq`, set `status: 'confirmed'`, `payment`, run
  `findOrCreateCustomerCore` + set `customer_id`, log a `kind: 'order'` activity
  event on the customer, send the confirmation email (best-effort, like every other
  mail). Ordering follows the deposit-webhook lesson: durable writes first, email
  last.
- `charge.refunded` (new event type) → set `status: 'refunded'` + `refund` on the
  order (idempotent no-op if already refunded). Registered on the connected-account
  webhook endpoint alongside the existing event.

### 5.3 Inventory and the pending hold

No cart timers. Availability is derived:

```
available(item) = stock − Σ qty over orders where
  status ∈ {confirmed, picked_up}
  ∪ {pending with expires_at > now}
```

At checkout submission a Firestore transaction validates the drop is open and every
line is available, then creates the `pending` order with `expires_at = now + 15min`
and returns the PaymentIntent client secret. Expired pending orders are simply
ignored by the availability read — no cron, no cleanup job; a later write may
opportunistically delete them. If payment lands after expiry (slow 3DS), the webhook
still confirms — a bounded, accepted oversell window at our operator's volume, noted
here deliberately (Hot Plate solves this with cart timers; we take the simpler trade
until a hype-drop customer forces the upgrade).

### 5.4 Refunds (new capability)

Admin action `cancelOrder(orderId, { restock?: boolean, note? })` →
`stripe.refunds.create({ payment_intent }, { stripeAccount })` with
`refund_application_fee: true` (the platform eats its 1% on refunds — owner-first),
sets `status: 'canceled'` immediately; `charge.refunded` webhook settles the
`refund` record. Restock is implicit: canceled/refunded orders drop out of the
availability sum. Partial refunds are out of scope.

## 6. Operator surface

New module id **`'storefront'`** in `lib/industry-packs.ts`, enabled for the
coffee-cart pack (and any pack that wants it), vertical-skinned label via the pack
layer: coffee-cart → **"Drops"**, generic → "Online orders". Nav lands in the
Operations section. (The forward-declared `'pos'` id stays reserved for the future
counter/tab increments; `publicMode` stays untouched.)

Screens (matching existing admin patterns — server components + client editors,
server actions guarded by `assertOrgAdmin`):

1. **Drops list** — cards by phase (open / scheduled / draft / past) with order
   counts and revenue.
2. **Drop editor** — title/note, open/close datetimes (browser-tz captured), pickup
   location + windows (+ optional slot length), item picker from products (with
   per-item stock override), channel checkboxes, publish. Publishing a scheduled
   drop with `email` in `channels` sends the announcement to subscribers **at
   publish time** — the operator controls announcement timing by choosing when to
   publish (no scheduled-send infrastructure in v1) — via Resend batch, chunks of
   100, `communicate.ts` pattern, stamping `announced_at`; the share kit panel renders the composed post text + public URL
   for copy-paste regardless of channels.
3. **Orders board (per drop)** — the working screen for pickup day: orders grouped
   by pickup window, pickup numbers, mark picked up (one tap), cancel+refund; an
   **aggregated prep view** (Σ qty per product across confirmed orders — Hot Plate's
   "prep list", derivable with zero recipe data).
4. **Products** — grid with photos, add/edit/archive.

Payout visibility, charge lists, etc. stay in the org's own Stripe dashboard — same
stance as every existing payment feature.

## 7. CRM, calendar, reporting

- Every confirmed order upserts a Customer (email dedup) and logs `kind: 'order'`
  activity — order history appears on the customer story like any other touch.
  **No leads/opportunities are created** — retail orders are not pipeline.
- `lib/calendar.ts` gains `CalendarKind 'drop'`: one calendar entry per pickup day of
  scheduled/open drops (and thus the ICS feed via the existing `?include=` filter).
- Reporting v1 is the drops-list revenue rollup only. Closeout/margin integration
  and org-level sales reports arrive with the counter/tab increments, when the
  Order ledger spans channels.

## 8. Error handling

- Drop closes mid-checkout: the intent-creation transaction re-checks `dropPhase`;
  buyer gets a friendly "sales just ended" state.
- Payment failure/abandon: order stays `pending` until `expires_at`, then evaporates
  from availability; no dunning.
- Webhook retries: confirm flow is idempotent (status guard + transactional number
  assignment), refund handler is a no-op on repeat — same discipline as
  `reconcileProposalDeposit`.
- Slow 3DS past expiry: webhook still confirms (§5.3, accepted oversell trade).
- Org without Stripe connected: drop editor blocks publishing with a "connect
  Stripe" gate (existing billing-page link), public page never renders checkout.
- Email failures are best-effort and logged, never block the money path (house rule).

## 9. Testing

Vitest, mirroring existing suites (pure engines get the depth):

- `dropPhase`, availability math (pending expiry, stock boundaries, unlimited),
  server-side total/fee/tip computation — pure-function tests.
- Checkout transaction: sold-out rejection, closed-drop rejection, concurrent-order
  contention (emulator or mocked transaction harness, whichever house pattern the
  units-core suite established).
- Webhook: confirm idempotency (double-fire), refund idempotency, out-of-order
  refund-before-confirm.
- Public projection: no stock counts, tokens, or internal ids leak.
- Existing caveat honored: run vitest with the `--exclude '**/.claude/**'` guard from
  the primary checkout.

## 10. Future increments (the POS story, for orientation only)

1. **SMS channel** — vendor selection via the marketplace flow + A2P 10DLC
   registration; `channels: ['sms']` and Customer.phone capture already exist.
2. **Counter channel** — mobile-web register for market days: tap-to-tally,
   record-only + cash + QR-to-pay (QR resolves to the §4 checkout for an ad-hoc
   order). Reuses Product, Order (`channel: 'counter'`), and the payment rails
   wholesale.
3. **Tab channel** — capped tabs attached to booked events; tallies against the cap
   on the counter screen; overage collected via QR checkout; feeds closeout actuals.
4. **Social auto-posting** — Meta/TikTok content APIs behind app review.
5. **Waitlists / cart timers / gift cards** — by customer pull, in that order.
