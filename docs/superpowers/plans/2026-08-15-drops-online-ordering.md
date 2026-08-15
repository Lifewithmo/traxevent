# Drops & Online Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hot Plate-style drops v1 — org products, scheduled pre-order drops with pickup windows and per-item stock, a public branded drop page with guest Stripe checkout, an operator orders board with refunds and prep aggregation, and email subscribers/announcements — per spec `docs/superpowers/specs/2026-08-15-drops-online-ordering-design.md`.

**Architecture:** New org-scoped Firestore subcollections `products`, `drops`, `orders` behind guard-free `lib/storefront/*` cores and `'use server'` action wrappers, exactly mirroring the resources/work-packages split. Payments ride the existing Stripe Connect rails: a new intent route creates a `pending` order in a Firestore transaction (availability enforced against a 15-minute hold) then a PaymentIntent on the org's connected account with **no application fee**; the existing payments webhook confirms orders (transactional per-drop pickup numbers), links customers, and reconciles externally-initiated refunds. Public pages are Admin-SDK-only with hand-built projections.

**Tech Stack:** Next.js 16.2.6 (App Router, classic caching model), React 19, Firebase Admin SDK (Firestore + Storage), Stripe (`stripe` + `@stripe/react-stripe-js`), Resend, Tailwind 4, vitest.

## Global Constraints

Copied from the spec and house conventions — every task's requirements implicitly include these:

- **Next 16.2.6 conventions** (this is NOT the Next you know — verified against `node_modules/next/dist/docs/`): `params`/`searchParams` are **Promises and must be awaited**; sync access is removed. Pages/routes type them inline: `{ params }: { params: Promise<{ handle: string }> }`. Public and admin pages declare `export const dynamic = 'force-dynamic'` as **line 1**. Do NOT use `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, or `revalidateTag` (repo has no `cacheComponents` and uses none of these). Route handlers: `export async function POST(req: Request)` + `NextResponse.json`; middleware is root `proxy.ts` (already migrated — don't touch).
- **Never re-export a type from a `'use server'` module** — breaks `next build` while tsc passes (memory: `nextjs-use-server-no-type-reexport`). Types live in `lib/types.ts`; input types live in the lib core module and are imported by the action file.
- **House data conventions:** snake_case Firestore fields; ISO-string timestamps (`new Date().toISOString()`); entity ids `randomBytes(8).toString('hex')` minted in cores; public tokens `generateAccessToken()` from `lib/tokens.ts` (48 hex chars); docs carry their own `id`; `org_id` denormalized on docs resolved via collectionGroup token queries. Strip `undefined` before `.set()` (Firestore rejects it) via conditional spreads: `...(x !== undefined ? { x } : {})`.
- **Money is dollars** (not cents) in Firestore, `round2` rounding; cents only at the Stripe boundary (`Math.round(dollars * 100)`).
- **No platform fee on drop orders** — PaymentIntents get NO `application_fee_amount` (monetization decision 2026-08-15, spec §1 decision 2).
- **Public access pattern:** all public reads/writes go through Admin SDK server-side (`'use server'` actions or route handlers); public projections are hand-built field-by-field, never spread; `firestore.rules` untouched (default-deny covers new collections). Public writes sit behind `lib/rate-limit.ts` + honeypot + time gate (intake pattern).
- **Vertical skin rule:** no shared noun renders untranslated — user-facing labels come through `lib/industry-packs.ts` helpers (coffee-cart sees "Drops", generic sees "Online orders").
- **Server-action security:** every `'use server'` export is reachable via direct POST — auth (`assertOrgMember`/`assertOrgAdmin`) or token possession must be verified inside every function.
- **Test conventions:** vitest + jsdom, `vi.hoisted` spies → `vi.mock` blocks → import-under-test, `beforeEach(() => vi.clearAllMocks())`. Run from the primary checkout as `npx vitest run --exclude '**/.claude/**'` (memory: test worktree pollution). Full-suite + `npx next build` must pass before the branch is called green.
- **Commits:** one per task, `feat(drops): …` / `test(drops): …` style, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Concurrent-work caveat:** branch `feat/invoice-redesign` (unmerged) touches `app/(admin)/[orgSlug]/layout.tsx` + `components/layout/AdminSidebar.tsx` (mobile drawer, commit `4435d77`). This plan's sidebar edits (Task 14) are additive (one opsLinks entry + `ORG_PAGE_SLUGS` additions) — keep them minimal to merge cleanly.

## File Structure

**New files**
```
lib/storefront/drop-logic.ts            pure: phases, totals, availability (no DB imports)
lib/storefront/products.ts              core CRUD for orgs/{id}/products
lib/storefront/drops.ts                 core CRUD + publish/close/stock for orgs/{id}/drops
lib/storefront/orders.ts                core: pending/confirm transactions, list, pickup, refund
actions/products.ts                     admin actions + photo upload
actions/drops.ts                        admin actions + publish-with-announcement
actions/orders.ts                       admin actions incl. cancelOrder → Stripe refund
actions/storefront-public.ts            public: drop page data, order status, subscribe/unsubscribe
app/api/payments/drop-order/intent/route.ts
app/(public)/p/[handle]/drops/[dropId]/page.tsx
app/(public)/orders/[token]/page.tsx
app/(public)/unsubscribe/[token]/page.tsx
app/(admin)/[orgSlug]/drops/page.tsx
app/(admin)/[orgSlug]/drops/new/page.tsx
app/(admin)/[orgSlug]/drops/[dropId]/page.tsx
app/(admin)/[orgSlug]/drop-orders/[dropId]/page.tsx     ← sidebar-free (see Task 16)
components/storefront/DropStorefront.tsx                public drop page client (cart + states)
components/storefront/DropCheckout.tsx                  Stripe Elements checkout
components/storefront/SubscribeCard.tsx                 email capture (public profile + drop page)
components/admin/storefront/StorefrontClient.tsx        tabs: Drops | Products
components/admin/storefront/DropsTab.tsx
components/admin/storefront/ProductsTab.tsx
components/admin/storefront/DropEditorClient.tsx        editor + publish + share kit
components/admin/storefront/OrdersBoardClient.tsx       pickup-day board + prep view
__tests__/lib/storefront/drop-logic.test.ts
__tests__/lib/storefront/products.test.ts
__tests__/lib/storefront/drops.test.ts
__tests__/lib/storefront/orders.test.ts
__tests__/actions/drops.test.ts
__tests__/actions/orders.test.ts
__tests__/actions/storefront-public.test.ts
__tests__/api/drop-order-intent.test.ts
__tests__/api/payments-webhook-drops.test.ts
__tests__/components/storefront/DropStorefront.test.tsx
__tests__/components/storefront/SubscribeCard.test.tsx
__tests__/components/admin/storefront/ProductsTab.test.tsx
__tests__/components/admin/storefront/DropsTab.test.tsx
__tests__/components/admin/storefront/OrdersBoardClient.test.tsx
```

**Modified files**
```
lib/types.ts                    new section: Product/Drop/Order/CustomerMarketing types; Customer.marketing; ActivityEvent kind +'order'
lib/industry-packs.ts           ModuleId +'storefront'; coffee-cart pack; storefrontLabel()
lib/public-profile.ts           RESERVED_HANDLES += orders, unsubscribe, drops, products, drop-orders
lib/email.ts                    sendOrderConfirmation, buildDropAnnouncementEmail
lib/calendar.ts                 CalendarKind +'drop'; label; feed block
lib/calendar-feed.ts            fetch drops into the feed
app/api/payments/webhook/route.ts   purpose 'drop_order' + charge.refunded handler
app/(public)/p/[handle]/page.tsx    Next-drop card + SubscribeCard
components/layout/AdminSidebar.tsx  ORG_PAGE_SLUGS += drops; opsLinks storefront entry
firestore.indexes.json          fieldOverrides: orders.token, customers.marketing.unsubscribe_token (COLLECTION_GROUP asc, mirroring proposals.token)
__tests__/lib/industry-packs.test.ts, __tests__/lib/calendar.test.ts, __tests__/lib/calendar-feed.test.ts, __tests__/components/layout/AdminSidebar.test.tsx   extended
```

**Spec deviations locked here** (documented, deliberate):
1. Stored `DropStatus` is `'draft' | 'scheduled' | 'closed' | 'archived'` — the spec's `'open'` is never *stored*; it exists only as the derived `DropPhase` (`dropPhase()`), per the spec's own §3.2 note that open/closed is derived at read time and `status` records operator intent.
2. `cancelOrder` writes `status: 'refunded'` + the refund record directly from the synchronous Stripe refund response; the `charge.refunded` webhook is idempotent reconciliation that also catches refunds issued from the org's own Stripe dashboard. `'canceled'` stays in the union for the future counter channel but is never set in v1.
3. Post-publish edits are limited to: manual close, per-item stock adjustment, and archive. Everything else requires the drop to still be a draft (item/price/window edits after orders exist would corrupt order references). The spec is silent on this; this is the safe reading.

---

### Task 1: Types, storefront module id, vertical labels

**Files:**
- Modify: `lib/types.ts` (new section after the units section; plus `Customer.marketing?`, `ActivityEvent.kind` union)
- Modify: `lib/industry-packs.ts`
- Test: `__tests__/lib/industry-packs.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by every later task): `Product`, `DropPickupWindow`, `DropPickup`, `DropItem`, `DropStatus`, `DropPhase`, `DropChannel`, `Drop`, `OrderChannel`, `OrderStatus`, `OrderLine`, `OrderBuyer`, `OrderPayment`, `OrderRefund`, `Order`, `CustomerMarketing` in `@/lib/types`; `ModuleId` now includes `'storefront'`; `storefrontLabel(pack: IndustryPack): string` in `@/lib/industry-packs`.

- [ ] **Step 1: Write the failing test** — append to `__tests__/lib/industry-packs.test.ts`:

```ts
import { getIndustryPack, isModuleEnabled, storefrontLabel } from '@/lib/industry-packs'

describe('storefront module (drops)', () => {
  it('coffee-cart pack enables storefront', () => {
    expect(isModuleEnabled(getIndustryPack('coffee-cart'), 'storefront')).toBe(true)
  })
  it('general pack does not enable storefront yet', () => {
    expect(isModuleEnabled(getIndustryPack('general'), 'storefront')).toBe(false)
  })
  it('labels are vertical-skinned', () => {
    expect(storefrontLabel(getIndustryPack('coffee-cart'))).toBe('Drops')
    expect(storefrontLabel(getIndustryPack('general'))).toBe('Online orders')
  })
})
```

(Match the existing import style at the top of that file — merge imports rather than duplicating.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/industry-packs.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `storefrontLabel` is not exported / module not enabled.

- [ ] **Step 3: Implement.** In `lib/industry-packs.ts`: add `'storefront'` to the `ModuleId` union (after `'forms'`, before the forward-declared comment group — it is now real); add `'storefront'` to the **coffee-cart** pack's `modules` array only; add below `catalogLabel`:

```ts
/** Vertical-skinned label for the storefront module (spec 2026-08-15 §6). */
export function storefrontLabel(pack: IndustryPack): string {
  return pack.catalogKind === 'menu' ? 'Drops' : 'Online orders'
}
```

In `lib/types.ts`, add `'order'` to the `ActivityEvent.kind` inline union (at ~line 716), add `marketing?: CustomerMarketing` to `Customer`, and append this new section before the Operations-core section divider style used elsewhere:

```ts
// ── Drops & online ordering (spec 2026-08-15) ─────────────────────────

export interface Product {
  id: string
  name: string
  description?: string
  price: number                      // dollars
  photo_url?: string                 // tokenized Firebase Storage URL
  active: boolean                    // false = archived, hidden from new drops
  catalog_ref?: { kind: 'work_package' | 'resource'; id: string }  // dormant seam (spec §3.1)
  created_at: string
  updated_at?: string
}

export interface DropPickupWindow {
  id: string
  day: string                        // YYYY-MM-DD (in the drop's timezone)
  start: string                      // HH:mm
  end: string                        // HH:mm
  slot_minutes?: number              // set = buyer picks a slot within the window
}

export interface DropPickup {
  location_name: string
  address?: string                   // display-only
  windows: DropPickupWindow[]
}

// Item snapshot taken from Product at drop creation — in-flight drops are
// immune to product edits (same snapshot philosophy as proposal templates).
export interface DropItem {
  product_id: string
  name: string
  price: number
  description?: string
  photo_url?: string
  stock?: number                     // undefined = unlimited
}

// Stored status records operator intent; whether sales are open is DERIVED
// (dropPhase in lib/storefront/drop-logic.ts) — 'open' is never stored.
export type DropStatus = 'draft' | 'scheduled' | 'closed' | 'archived'
export type DropPhase = 'draft' | 'upcoming' | 'open' | 'ended' | 'archived'
export type DropChannel = 'email' | 'sms' | 'instagram' | 'facebook' | 'tiktok'

export interface Drop {
  id: string
  title: string
  note?: string                      // thank-you blurb on the public page
  status: DropStatus
  opens_at: string                   // UTC instant, ISO (normalized via toISOString)
  closes_at: string                  // UTC instant, ISO
  timezone: string                   // IANA, captured from the editor's browser
  pickup: DropPickup
  items: DropItem[]
  tax_rate?: number                  // flat percent, manual (house convention)
  channels: DropChannel[]            // announcement fan-out; v1 acts on 'email'
  announced_at?: string              // set when the announcement email went out
  order_seq?: number                 // per-drop pickup-number counter (transactional)
  created_at: string
  updated_at?: string
}

export type OrderChannel = 'drop' | 'counter' | 'tab'   // counter/tab reserved, unbuilt
export type OrderStatus = 'pending' | 'confirmed' | 'picked_up' | 'canceled' | 'refunded'

export interface OrderLine {
  product_id: string
  name: string                       // snapshot
  price: number                      // snapshot, dollars
  qty: number
}

export interface OrderBuyer { name: string; email: string; phone?: string }
export interface OrderPayment { intent_id: string; paid_at: string }
export interface OrderRefund { refund_id: string; amount: number; refunded_at: string; note?: string }

export interface Order {
  id: string
  org_id: string                     // denormalized for collectionGroup token lookup
  channel: OrderChannel
  drop_id: string
  status: OrderStatus
  expires_at?: string                // pending-hold expiry; expired pending orders release stock
  number?: number                    // per-drop pickup number, assigned on confirm
  customer_id?: string               // linked by the webhook via findOrCreateCustomerCore
  buyer: OrderBuyer
  lines: OrderLine[]
  pickup_window_id: string
  pickup_slot?: string               // HH:mm, when the window has slot_minutes
  subtotal: number
  tax_rate?: number
  tax: number
  tip?: number                       // 100% to the operator; excluded from nothing — it's in total
  total: number
  payment?: OrderPayment
  refund?: OrderRefund
  token: string                      // public status-page token (48 hex)
  created_at: string
  updated_at?: string
}

export interface CustomerMarketing {
  subscribed: boolean
  subscribed_at: string
  source: 'drop_page' | 'profile'
  unsubscribe_token: string          // 48 hex; /unsubscribe/[token]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/industry-packs.test.ts --exclude '**/.claude/**'`
Expected: PASS (including all pre-existing tests in the file).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/industry-packs.ts __tests__/lib/industry-packs.test.ts
git commit -m "feat(drops): storefront types, module id, vertical labels"
```

---

### Task 2: Pure drop logic — phases, totals, availability

**Files:**
- Create: `lib/storefront/drop-logic.ts`
- Test: `__tests__/lib/storefront/drop-logic.test.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `dropPhase(drop, nowIso): DropPhase`; `CartLine { product_id, qty }`; `OrderTotals { lines, subtotal, tax_rate?, tax, tip, total }`; `computeOrderTotals(items, cart, opts?)`; `AvailabilityOrder`; `soldByProduct(orders, nowIso): Map<string, number>`; `availableStock(item, sold): number | null`; `cartFits(items, cart, sold): { ok: true } | { ok: false; name: string }`; constants `MAX_LINE_QTY = 50`, `MAX_TIP = 500`, `PENDING_HOLD_MS = 15 * 60 * 1000`.

- [ ] **Step 1: Write the failing tests** — `__tests__/lib/storefront/drop-logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  dropPhase, computeOrderTotals, soldByProduct, availableStock, cartFits,
  MAX_LINE_QTY, PENDING_HOLD_MS,
} from '@/lib/storefront/drop-logic'
import type { DropItem } from '@/lib/types'

const ITEMS: DropItem[] = [
  { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 10 },
  { product_id: 'p2', name: 'Club Soda', price: 4.5 },              // unlimited
]

describe('dropPhase', () => {
  const drop = { status: 'scheduled' as const, opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z' }
  it('derives upcoming / open / ended from instants', () => {
    expect(dropPhase(drop, '2026-08-20T14:59:59.000Z')).toBe('upcoming')
    expect(dropPhase(drop, '2026-08-20T15:00:00.000Z')).toBe('open')
    expect(dropPhase(drop, '2026-08-21T15:00:00.000Z')).toBe('ended')
  })
  it('status intent wins: draft/archived pass through; closed = ended even mid-window', () => {
    expect(dropPhase({ ...drop, status: 'draft' }, '2026-08-20T16:00:00.000Z')).toBe('draft')
    expect(dropPhase({ ...drop, status: 'archived' }, '2026-08-20T16:00:00.000Z')).toBe('archived')
    expect(dropPhase({ ...drop, status: 'closed' }, '2026-08-20T16:00:00.000Z')).toBe('ended')
  })
})

describe('computeOrderTotals', () => {
  it('snapshots name/price from drop items and rounds money', () => {
    const t = computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 2 }, { product_id: 'p2', qty: 1 }], { tax_rate: 6, tip: 2 })
    expect(t.lines).toEqual([
      { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 },
      { product_id: 'p2', name: 'Club Soda', price: 4.5, qty: 1 },
    ])
    expect(t.subtotal).toBe(15.5)
    expect(t.tax).toBe(0.93)       // 15.5 * 6% = 0.93
    expect(t.tip).toBe(2)
    expect(t.total).toBe(18.43)
  })
  it('no tax_rate → zero tax and no tax_rate key', () => {
    const t = computeOrderTotals(ITEMS, [{ product_id: 'p2', qty: 1 }])
    expect(t.tax).toBe(0)
    expect(t).not.toHaveProperty('tax_rate')
    expect(t.total).toBe(4.5)
  })
  it('rejects empty carts, unknown items, dupes, bad qty, bad tips', () => {
    expect(() => computeOrderTotals(ITEMS, [])).toThrow('empty')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'nope', qty: 1 }])).toThrow('no longer available')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1 }, { product_id: 'p1', qty: 1 }])).toThrow('Duplicate')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 0 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1.5 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: MAX_LINE_QTY + 1 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1 }], { tip: -1 })).toThrow('tip')
  })
})

describe('availability', () => {
  const NOW = '2026-08-20T16:00:00.000Z'
  const LATER = new Date(Date.parse(NOW) + PENDING_HOLD_MS).toISOString()
  it('counts confirmed, picked_up, and unexpired pending; ignores expired pending and refunded', () => {
    const sold = soldByProduct([
      { status: 'confirmed', lines: [{ product_id: 'p1', qty: 3 }] },
      { status: 'picked_up', lines: [{ product_id: 'p1', qty: 2 }] },
      { status: 'pending', expires_at: LATER, lines: [{ product_id: 'p1', qty: 1 }] },
      { status: 'pending', expires_at: '2026-08-20T15:00:00.000Z', lines: [{ product_id: 'p1', qty: 4 }] },
      { status: 'refunded', lines: [{ product_id: 'p1', qty: 5 }] },
    ], NOW)
    expect(sold.get('p1')).toBe(6)
    expect(availableStock(ITEMS[0], sold)).toBe(4)
  })
  it('unlimited stock returns null availability and always fits', () => {
    const sold = soldByProduct([], NOW)
    expect(availableStock(ITEMS[1], sold)).toBeNull()
    expect(cartFits(ITEMS, [{ product_id: 'p2', qty: 40 }], sold)).toEqual({ ok: true })
  })
  it('cartFits names the item that does not fit', () => {
    const sold = soldByProduct([{ status: 'confirmed', lines: [{ product_id: 'p1', qty: 9 }] }], NOW)
    expect(cartFits(ITEMS, [{ product_id: 'p1', qty: 2 }], sold)).toEqual({ ok: false, name: 'Vanilla Latte' })
    expect(cartFits(ITEMS, [{ product_id: 'p1', qty: 1 }], sold)).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/storefront/drop-logic.test.ts --exclude '**/.claude/**'`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `lib/storefront/drop-logic.ts` (pure — NO DB imports, mirroring `lib/ops/units.ts`):

```ts
import type { DropItem, DropPhase, DropStatus, OrderLine, OrderStatus } from '@/lib/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const MAX_LINE_QTY = 50
export const MAX_TIP = 500
export const PENDING_HOLD_MS = 15 * 60 * 1000

export interface CartLine { product_id: string; qty: number }

// Both instants are toISOString-normalized UTC, so lexicographic comparison
// is chronological. Cores normalize opens_at/closes_at on write (Task 4).
export function dropPhase(
  drop: { status: DropStatus; opens_at: string; closes_at: string },
  nowIso: string,
): DropPhase {
  if (drop.status === 'draft') return 'draft'
  if (drop.status === 'archived') return 'archived'
  if (drop.status === 'closed') return 'ended'
  if (nowIso < drop.opens_at) return 'upcoming'
  if (nowIso >= drop.closes_at) return 'ended'
  return 'open'
}

export interface OrderTotals {
  lines: OrderLine[]
  subtotal: number
  tax_rate?: number
  tax: number
  tip: number
  total: number
}

// Server-authoritative money math — client totals are never trusted.
export function computeOrderTotals(
  items: DropItem[],
  cart: CartLine[],
  opts?: { tax_rate?: number; tip?: number },
): OrderTotals {
  if (cart.length === 0) throw new Error('Your cart is empty')
  const byId = new Map(items.map((i) => [i.product_id, i]))
  const seen = new Set<string>()
  const lines: OrderLine[] = cart.map((c) => {
    const item = byId.get(c.product_id)
    if (!item) throw new Error('An item in your cart is no longer available')
    if (seen.has(c.product_id)) throw new Error('Duplicate item in cart')
    seen.add(c.product_id)
    if (!Number.isInteger(c.qty) || c.qty < 1 || c.qty > MAX_LINE_QTY) {
      throw new Error('Invalid quantity')
    }
    return { product_id: item.product_id, name: item.name, price: item.price, qty: c.qty }
  })
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0))
  const rate = opts?.tax_rate
  const hasTax = typeof rate === 'number' && rate > 0
  const tax = hasTax ? round2((subtotal * rate) / 100) : 0
  const tipRaw = opts?.tip ?? 0
  if (!Number.isFinite(tipRaw) || tipRaw < 0 || tipRaw > MAX_TIP) throw new Error('Invalid tip')
  const tip = round2(tipRaw)
  return {
    lines,
    subtotal,
    ...(hasTax ? { tax_rate: rate } : {}),
    tax,
    tip,
    total: round2(subtotal + tax + tip),
  }
}

export interface AvailabilityOrder {
  status: OrderStatus
  expires_at?: string
  lines: Array<Pick<OrderLine, 'product_id' | 'qty'>>
}

// available = stock − (confirmed + picked_up + unexpired pending). Expired
// pending orders simply stop counting — no cron, no cleanup job (spec §5.3).
export function soldByProduct(orders: AvailabilityOrder[], nowIso: string): Map<string, number> {
  const sold = new Map<string, number>()
  for (const o of orders) {
    const counts =
      o.status === 'confirmed' ||
      o.status === 'picked_up' ||
      (o.status === 'pending' && !!o.expires_at && o.expires_at > nowIso)
    if (!counts) continue
    for (const l of o.lines) sold.set(l.product_id, (sold.get(l.product_id) ?? 0) + l.qty)
  }
  return sold
}

/** null = unlimited. */
export function availableStock(item: DropItem, sold: Map<string, number>): number | null {
  if (item.stock === undefined) return null
  return Math.max(0, item.stock - (sold.get(item.product_id) ?? 0))
}

export function cartFits(
  items: DropItem[],
  cart: CartLine[],
  sold: Map<string, number>,
): { ok: true } | { ok: false; name: string } {
  const byId = new Map(items.map((i) => [i.product_id, i]))
  for (const c of cart) {
    const item = byId.get(c.product_id)
    if (!item) return { ok: false, name: 'an item' }
    const avail = availableStock(item, sold)
    if (avail !== null && c.qty > avail) return { ok: false, name: item.name }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/storefront/drop-logic.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storefront/drop-logic.ts __tests__/lib/storefront/drop-logic.test.ts
git commit -m "feat(drops): pure drop logic — phases, totals, availability"
```

---

### Task 3: Products core + actions + photo upload

**Files:**
- Create: `lib/storefront/products.ts`, `actions/products.ts`
- Test: `__tests__/lib/storefront/products.test.ts`

**Interfaces:**
- Consumes: `Product` (Task 1); `adminDb`, `adminBucket` from `@/lib/firebase-admin`; `assertImageUpload`, `safeUploadName`, `tokenizedDownloadUrl` from `@/lib/uploads`; `assertOrgMember`, `assertOrgAdmin` from `@/lib/auth/assert`.
- Produces: `productsRef(orgId)`, `listProductsCore(orgId): Promise<Product[]>`, `createProductCore(orgId, input): Promise<Product>`, `updateProductCore(orgId, productId, updates): Promise<void>`, `CreateProductInput { name; price; description?; photo_url? }`, `ProductUpdate { name?; price?; description?: string | null; photo_url?: string | null; active?: boolean }` in `@/lib/storefront/products`; actions `listProducts`, `createProduct`, `updateProduct`, `uploadProductPhoto(orgId, formData): Promise<{ url: string }>` in `@/actions/products`.

- [ ] **Step 1: Write the failing tests** — `__tests__/lib/storefront/products.test.ts` (firebase-admin mock pattern from `__tests__/actions/leads.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn())
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))

vi.mock('@/lib/firebase-admin', () => {
  const productsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-product-id',
      set: docSetSpy,
      update: docUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'products' ? productsCol : {})),
  }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

import { createProductCore, updateProductCore, listProductsCore } from '@/lib/storefront/products'

describe('products core', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createProductCore writes id, trimmed name, active:true, created_at; omits empty optionals', async () => {
    const p = await createProductCore('org-1', { name: '  Vanilla Latte ', price: 5.5 })
    expect(docSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vanilla Latte', price: 5.5, active: true, created_at: expect.any(String) })
    )
    const written = docSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('description')
    expect(written).not.toHaveProperty('photo_url')
    expect(p.id).toHaveLength(16)
  })

  it('rejects empty names and non-positive prices', async () => {
    await expect(createProductCore('org-1', { name: '  ', price: 5 })).rejects.toThrow('Name is required')
    await expect(createProductCore('org-1', { name: 'x', price: 0 })).rejects.toThrow('Price must be greater than zero')
  })

  it('updateProductCore skips undefined, maps null to FieldValue.delete, sets updated_at', async () => {
    await updateProductCore('org-1', 'p1', { name: 'New', description: null, price: undefined, active: false })
    const written = docUpdateSpy.mock.calls[0][0]
    expect(written.name).toBe('New')
    expect(written.description).toBe(fieldValueDeleteSentinel)
    expect(written).not.toHaveProperty('price')
    expect(written.active).toBe(false)
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('listProductsCore returns docs ordered by name', async () => {
    listGetSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'a', name: 'A' }) }] })
    const out = await listProductsCore('org-1')
    expect(out).toEqual([{ id: 'a', name: 'A' }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/storefront/products.test.ts --exclude '**/.claude/**'`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `lib/storefront/products.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import type { Product } from '@/lib/types'

export interface CreateProductInput {
  name: string
  price: number
  description?: string
  photo_url?: string
}

export interface ProductUpdate {
  name?: string
  price?: number
  description?: string | null
  photo_url?: string | null
  active?: boolean
}

export function productsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('products')
}

export async function listProductsCore(orgId: string): Promise<Product[]> {
  const snap = await productsRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as Product)
}

/** Guard-free create. Validates name + price; performs no auth. */
export async function createProductCore(orgId: string, input: CreateProductInput): Promise<Product> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!(input.price > 0)) throw new Error('Price must be greater than zero')
  const id = randomBytes(8).toString('hex')
  const product: Product = {
    id,
    name: input.name.trim(),
    price: input.price,
    active: true,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.photo_url ? { photo_url: input.photo_url } : {}),
    created_at: new Date().toISOString(),
  }
  await productsRef(orgId).doc(id).set(product)
  return product
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateProductCore(orgId: string, productId: string, updates: ProductUpdate): Promise<void> {
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  if (updates.price !== undefined && !(updates.price > 0)) throw new Error('Price must be greater than zero')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await productsRef(orgId).doc(productId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
```

And `actions/products.ts` (wrapper pattern from `actions/resources.ts`; upload pattern from `actions/org-assets.ts`):

```ts
'use server'

import { randomUUID } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'
import { assertImageUpload, safeUploadName, tokenizedDownloadUrl } from '@/lib/uploads'
import {
  listProductsCore, createProductCore, updateProductCore,
  type CreateProductInput, type ProductUpdate,
} from '@/lib/storefront/products'
import type { Product } from '@/lib/types'

export async function listProducts(orgId: string): Promise<Product[]> {
  await assertOrgMember(orgId)
  return listProductsCore(orgId)
}

export async function createProduct(orgId: string, input: CreateProductInput): Promise<Product> {
  await assertOrgAdmin(orgId)
  return createProductCore(orgId, input)
}

export async function updateProduct(orgId: string, productId: string, updates: ProductUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateProductCore(orgId, productId, updates)
}

/**
 * Product photos render on the PUBLIC drop page — same token-in-URL access
 * model and 8MB cap as org assets (lib/uploads.ts documents why).
 */
export async function uploadProductPhoto(orgId: string, formData: FormData): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)
  const file = assertImageUpload(formData.get('file'))
  const path = `product-images/${orgId}/${Date.now()}-${safeUploadName(file.name)}`
  const token = randomUUID()
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: tokenizedDownloadUrl(adminBucket.name, path, token) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/storefront/products.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storefront/products.ts actions/products.ts __tests__/lib/storefront/products.test.ts
git commit -m "feat(drops): products core, actions, photo upload"
```

---

### Task 4: Drops core + admin actions (no announcement yet)

**Files:**
- Create: `lib/storefront/drops.ts`, `actions/drops.ts`
- Test: `__tests__/lib/storefront/drops.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`Drop`, `DropChannel`, `listProductsCore`, `dropPhase`).
- Produces in `@/lib/storefront/drops`: `dropsRef(orgId)`; `DropWindowInput { day; start; end; slot_minutes? }`; `DropItemInput { product_id: string; stock?: number }`; `CreateDropInput { title; note?; opens_at; closes_at; timezone; pickup: { location_name; address?; windows: DropWindowInput[] }; items: DropItemInput[]; tax_rate?; channels: DropChannel[] }`; `createDropCore(orgId, input): Promise<Drop>`; `updateDraftDropCore(orgId, dropId, input: CreateDropInput): Promise<Drop>`; `getDropCore(orgId, dropId): Promise<Drop | null>`; `listDropsCore(orgId): Promise<Drop[]>`; `publishDropCore(orgId, dropId): Promise<Drop>`; `closeDropCore(orgId, dropId): Promise<void>`; `archiveDropCore(orgId, dropId): Promise<void>`; `adjustStockCore(orgId, dropId, productId, stock: number | null): Promise<void>`.
- Produces in `@/actions/drops`: `listDrops`, `getDrop`, `createDrop`, `updateDraftDrop`, `closeDrop`, `archiveDrop`, `adjustDropStock` (all admin-guarded; `listDrops`/`getDrop` member-guarded). `publishDrop` is added in Task 10 (it needs the email pieces).

- [ ] **Step 1: Write the failing tests** — `__tests__/lib/storefront/drops.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dropSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropGetSpy = vi.hoisted(() => vi.fn())
const listGetSpy = vi.hoisted(() => vi.fn())
const productsListSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const dropsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-drop-id',
      set: dropSetSpy,
      get: dropGetSpy,
      update: dropUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'drops' ? dropsCol : {})),
  }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

vi.mock('@/lib/storefront/products', () => ({ listProductsCore: productsListSpy }))

import { createDropCore, publishDropCore, closeDropCore, adjustStockCore } from '@/lib/storefront/drops'

const PRODUCTS = [
  { id: 'p1', name: 'Vanilla Latte', price: 5.5, active: true, description: 'smooth', photo_url: 'https://x/p1.jpg', created_at: 'x' },
  { id: 'p2', name: 'Retired', price: 4, active: false, created_at: 'x' },
]

const INPUT = {
  title: 'Weekend Drop',
  opens_at: '2026-08-20T15:00:00Z',
  closes_at: '2026-08-21T15:00:00Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', stock: 10 }],
  channels: ['email' as const],
}

describe('drops core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsListSpy.mockResolvedValue(PRODUCTS)
  })

  it('createDropCore snapshots product name/price/photo into items, mints window ids, normalizes instants, status draft', async () => {
    const drop = await createDropCore('org-1', INPUT)
    expect(drop.status).toBe('draft')
    expect(drop.items).toEqual([
      { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, description: 'smooth', photo_url: 'https://x/p1.jpg', stock: 10 },
    ])
    expect(drop.opens_at).toBe('2026-08-20T15:00:00.000Z')      // toISOString-normalized
    expect(drop.pickup.windows[0].id).toHaveLength(16)
    expect(dropSetSpy).toHaveBeenCalled()
  })

  it('rejects inactive/unknown products, empty items/windows, inverted instants, bad windows', async () => {
    await expect(createDropCore('org-1', { ...INPUT, items: [{ product_id: 'p2' }] })).rejects.toThrow('not available')
    await expect(createDropCore('org-1', { ...INPUT, items: [] })).rejects.toThrow('at least one item')
    await expect(createDropCore('org-1', { ...INPUT, pickup: { ...INPUT.pickup, windows: [] } })).rejects.toThrow('pickup window')
    await expect(createDropCore('org-1', { ...INPUT, closes_at: '2026-08-20T14:00:00Z' })).rejects.toThrow('close after it opens')
    await expect(
      createDropCore('org-1', { ...INPUT, pickup: { ...INPUT.pickup, windows: [{ day: 'nope', start: '08:00', end: '11:00' }] } })
    ).rejects.toThrow('valid pickup')
  })

  it('publishDropCore flips draft → scheduled; rejects non-drafts and past closes_at', async () => {
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...INPUT, id: 'd1', status: 'draft', opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', items: [{ product_id: 'p1', name: 'x', price: 5 }] }) })
    const out = await publishDropCore('org-1', 'd1')
    expect(out.status).toBe('scheduled')
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }))

    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', status: 'scheduled' }) })
    await expect(publishDropCore('org-1', 'd1')).rejects.toThrow('draft')
  })

  it('closeDropCore only closes scheduled drops; adjustStockCore rewrites one item stock', async () => {
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', status: 'scheduled', items: [{ product_id: 'p1', name: 'x', price: 5, stock: 10 }] }) })
    await closeDropCore('org-1', 'd1')
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }))

    await adjustStockCore('org-1', 'd1', 'p1', 25)
    const written = dropUpdateSpy.mock.calls.at(-1)![0]
    expect(written.items).toEqual([{ product_id: 'p1', name: 'x', price: 5, stock: 25 }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/storefront/drops.test.ts --exclude '**/.claude/**'`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `lib/storefront/drops.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { listProductsCore } from '@/lib/storefront/products'
import type { Drop, DropChannel, DropItem, DropPickupWindow } from '@/lib/types'

export interface DropWindowInput { day: string; start: string; end: string; slot_minutes?: number }
export interface DropItemInput { product_id: string; stock?: number }
export interface CreateDropInput {
  title: string
  note?: string
  opens_at: string
  closes_at: string
  timezone: string
  pickup: { location_name: string; address?: string; windows: DropWindowInput[] }
  items: DropItemInput[]
  tax_rate?: number
  channels: DropChannel[]
}

export function dropsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('drops')
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const CHANNELS: DropChannel[] = ['email', 'sms', 'instagram', 'facebook', 'tiktok']

// Validates input and resolves product snapshots. Shared by create + draft update.
async function buildDropFields(orgId: string, input: CreateDropInput) {
  if (!input.title?.trim()) throw new Error('Title is required')
  if (!input.timezone?.trim()) throw new Error('Timezone is required')
  const opens = new Date(input.opens_at)
  const closes = new Date(input.closes_at)
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) throw new Error('Please pick valid open and close times')
  if (closes.getTime() <= opens.getTime()) throw new Error('A drop must close after it opens')
  if (!input.pickup?.location_name?.trim()) throw new Error('Pickup location is required')
  if (!input.pickup.windows?.length) throw new Error('Add at least one pickup window')
  for (const w of input.pickup.windows) {
    const valid = DAY_RE.test(w.day) && TIME_RE.test(w.start) && TIME_RE.test(w.end) && w.start < w.end &&
      (w.slot_minutes === undefined || (Number.isInteger(w.slot_minutes) && w.slot_minutes > 0))
    if (!valid) throw new Error('Please enter valid pickup windows')
  }
  if (!input.items?.length) throw new Error('Add at least one item')
  if (input.tax_rate !== undefined && !(input.tax_rate >= 0 && input.tax_rate <= 30)) throw new Error('Invalid tax rate')
  const channels = (input.channels ?? []).filter((c) => CHANNELS.includes(c))

  const products = await listProductsCore(orgId)
  const byId = new Map(products.map((p) => [p.id, p]))
  const items: DropItem[] = input.items.map((i) => {
    const p = byId.get(i.product_id)
    if (!p || !p.active) throw new Error('A selected product is not available')
    if (i.stock !== undefined && (!Number.isInteger(i.stock) || i.stock < 0)) throw new Error('Invalid stock')
    return {
      product_id: p.id,
      name: p.name,
      price: p.price,
      ...(p.description ? { description: p.description } : {}),
      ...(p.photo_url ? { photo_url: p.photo_url } : {}),
      ...(i.stock !== undefined ? { stock: i.stock } : {}),
    }
  })
  const windows: DropPickupWindow[] = input.pickup.windows.map((w) => ({
    id: randomBytes(8).toString('hex'),
    day: w.day,
    start: w.start,
    end: w.end,
    ...(w.slot_minutes !== undefined ? { slot_minutes: w.slot_minutes } : {}),
  }))
  return {
    title: input.title.trim(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    opens_at: opens.toISOString(),
    closes_at: closes.toISOString(),
    timezone: input.timezone.trim(),
    pickup: {
      location_name: input.pickup.location_name.trim(),
      ...(input.pickup.address?.trim() ? { address: input.pickup.address.trim() } : {}),
      windows,
    },
    items,
    ...(input.tax_rate !== undefined && input.tax_rate > 0 ? { tax_rate: input.tax_rate } : {}),
    channels,
  }
}

export async function createDropCore(orgId: string, input: CreateDropInput): Promise<Drop> {
  const fields = await buildDropFields(orgId, input)
  const id = randomBytes(8).toString('hex')
  const drop: Drop = { id, status: 'draft', ...fields, created_at: new Date().toISOString() }
  await dropsRef(orgId).doc(id).set(drop)
  return drop
}

/** Full re-edit, drafts only — published drops have live order references. */
export async function updateDraftDropCore(orgId: string, dropId: string, input: CreateDropInput): Promise<Drop> {
  const existing = await getDropCore(orgId, dropId)
  if (!existing) throw new Error('Drop not found')
  if (existing.status !== 'draft') throw new Error('Only draft drops can be edited')
  const fields = await buildDropFields(orgId, input)
  const drop: Drop = { ...existing, ...fields, updated_at: new Date().toISOString() }
  await dropsRef(orgId).doc(dropId).set(drop)
  return drop
}

export async function getDropCore(orgId: string, dropId: string): Promise<Drop | null> {
  const snap = await dropsRef(orgId).doc(dropId).get()
  return snap.exists ? (snap.data() as Drop) : null
}

export async function listDropsCore(orgId: string): Promise<Drop[]> {
  const snap = await dropsRef(orgId).orderBy('opens_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Drop)
}

/** Guard-free publish: draft → scheduled. The Stripe/handle gates live in the action (Task 10). */
export async function publishDropCore(orgId: string, dropId: string): Promise<Drop> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  if (drop.status !== 'draft') throw new Error('Only draft drops can be published')
  if (!drop.items.length) throw new Error('Add at least one item before publishing')
  if (drop.closes_at <= new Date().toISOString()) throw new Error('This drop already closed — update its times first')
  const now = new Date().toISOString()
  await dropsRef(orgId).doc(dropId).update({ status: 'scheduled', updated_at: now })
  return { ...drop, status: 'scheduled', updated_at: now }
}

export async function closeDropCore(orgId: string, dropId: string): Promise<void> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  if (drop.status !== 'scheduled') throw new Error('Only a published drop can be closed')
  await dropsRef(orgId).doc(dropId).update({ status: 'closed', updated_at: new Date().toISOString() })
}

export async function archiveDropCore(orgId: string, dropId: string): Promise<void> {
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  await dropsRef(orgId).doc(dropId).update({ status: 'archived', updated_at: new Date().toISOString() })
}

/** Post-publish stock adjustment: rewrite one item's stock (null = unlimited). */
export async function adjustStockCore(orgId: string, dropId: string, productId: string, stock: number | null): Promise<void> {
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error('Invalid stock')
  const drop = await getDropCore(orgId, dropId)
  if (!drop) throw new Error('Drop not found')
  const items = drop.items.map((i) => {
    if (i.product_id !== productId) return i
    const { stock: _old, ...rest } = i
    return stock === null ? rest : { ...rest, stock }
  })
  await dropsRef(orgId).doc(dropId).update({ items, updated_at: new Date().toISOString() })
}
```

And `actions/drops.ts` (publishDrop intentionally absent until Task 10):

```ts
'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listDropsCore, getDropCore, createDropCore, updateDraftDropCore,
  closeDropCore, archiveDropCore, adjustStockCore,
  type CreateDropInput,
} from '@/lib/storefront/drops'
import type { Drop } from '@/lib/types'

export async function listDrops(orgId: string): Promise<Drop[]> {
  await assertOrgMember(orgId)
  return listDropsCore(orgId)
}

export async function getDrop(orgId: string, dropId: string): Promise<Drop | null> {
  await assertOrgMember(orgId)
  return getDropCore(orgId, dropId)
}

export async function createDrop(orgId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return createDropCore(orgId, input)
}

export async function updateDraftDrop(orgId: string, dropId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return updateDraftDropCore(orgId, dropId, input)
}

export async function closeDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return closeDropCore(orgId, dropId)
}

export async function archiveDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return archiveDropCore(orgId, dropId)
}

export async function adjustDropStock(orgId: string, dropId: string, productId: string, stock: number | null): Promise<void> {
  await assertOrgAdmin(orgId)
  return adjustStockCore(orgId, dropId, productId, stock)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/storefront/drops.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storefront/drops.ts actions/drops.ts __tests__/lib/storefront/drops.test.ts
git commit -m "feat(drops): drops core + admin actions (create/edit/publish/close/stock)"
```

---

### Task 5: Orders core — pending hold, confirm, pickup, refund

**Files:**
- Create: `lib/storefront/orders.ts`
- Test: `__tests__/lib/storefront/orders.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 (`Order`, `Drop`, `computeOrderTotals`, `soldByProduct`, `cartFits`, `dropPhase`, `PENDING_HOLD_MS`, `CartLine`); `generateAccessToken` from `@/lib/tokens`; `dropsRef` from Task 4.
- Produces in `@/lib/storefront/orders`: `ordersRef(orgId)`; `CheckoutInput { cart: CartLine[]; buyer: { name; email; phone? }; pickup_window_id: string; pickup_slot?: string; tip?: number }`; `createPendingOrderCore(orgId, drop: Drop, input: CheckoutInput): Promise<Order>`; `confirmOrderCore(orgId, orderId, payment: OrderPayment): Promise<{ order: Order; confirmedNow: boolean }>`; `listOrdersForDropCore(orgId, dropId): Promise<Order[]>`; `getOrderByTokenCore(token): Promise<Order | null>`; `markPickedUpCore(orgId, orderId): Promise<void>`; `markRefundedCore(orgId, orderId, refund: OrderRefund): Promise<void>`; `deletePendingOrderCore(orgId, orderId): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — `__tests__/lib/storefront/orders.test.ts`. Use the pass-through transaction pattern (`__tests__/actions/invoices.test.ts`) with per-doc get routing:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const orderSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderGetSpy = vi.hoisted(() => vi.fn())
const orderUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropGetSpy = vi.hoisted(() => vi.fn())
const ordersQueryGetSpy = vi.hoisted(() => vi.fn())
const txSetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const ordersCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      kind: 'order', id: id ?? 'new-order-id',
      set: orderSetSpy, get: orderGetSpy, update: orderUpdateSpy,
    })),
    where: vi.fn().mockReturnValue({ get: ordersQueryGetSpy, kind: 'orders-query' }),
  }
  const dropsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({ kind: 'drop', id, get: dropGetSpy })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'orders' ? ordersCol : sub === 'drops' ? dropsCol : {})),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      runTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          get: (ref: { kind?: string; get?: () => unknown }) => {
            if (ref.kind === 'orders-query') return ordersQueryGetSpy()
            if (ref.kind === 'drop') return dropGetSpy()
            return orderGetSpy()
          },
          set: txSetSpy,
        })
      ),
    },
  }
})

import { createPendingOrderCore, confirmOrderCore, markPickedUpCore, markRefundedCore } from '@/lib/storefront/orders'
import type { Drop, Order } from '@/lib/types'

const DROP: Drop = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled',
  opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 2 }],
  channels: ['email'], created_at: 'x',
}

const CHECKOUT = {
  cart: [{ product_id: 'p1', qty: 1 }],
  buyer: { name: 'Jane', email: 'jane@example.com' },
  pickup_window_id: 'w1',
}

describe('createPendingOrderCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ordersQueryGetSpy.mockResolvedValue({ docs: [] })
  })

  it('writes a pending order with server-computed totals, hold expiry, and a 48-char token', async () => {
    const order = await createPendingOrderCore('org-1', DROP, CHECKOUT)
    expect(order.status).toBe('pending')
    expect(order.total).toBe(5.5)
    expect(order.org_id).toBe('org-1')
    expect(order.channel).toBe('drop')
    expect(order.token).toHaveLength(48)
    expect(Date.parse(order.expires_at!)).toBeGreaterThan(Date.now())
    expect(txSetSpy).toHaveBeenCalled()
  })

  it('rejects when stock is exhausted by confirmed orders, naming the item', async () => {
    ordersQueryGetSpy.mockResolvedValue({
      docs: [{ data: () => ({ status: 'confirmed', lines: [{ product_id: 'p1', qty: 2 }] }) }],
    })
    await expect(createPendingOrderCore('org-1', DROP, CHECKOUT)).rejects.toThrow('Vanilla Latte')
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('rejects closed drops, unknown windows, missing slot when window is slotted, bad buyers', async () => {
    await expect(createPendingOrderCore('org-1', { ...DROP, status: 'closed' }, CHECKOUT)).rejects.toThrow('not open')
    await expect(createPendingOrderCore('org-1', DROP, { ...CHECKOUT, pickup_window_id: 'nope' })).rejects.toThrow('pickup window')
    const slotted: Drop = { ...DROP, pickup: { ...DROP.pickup, windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00', slot_minutes: 15 }] } }
    await expect(createPendingOrderCore('org-1', slotted, CHECKOUT)).rejects.toThrow('pickup time')
    await expect(createPendingOrderCore('org-1', slotted, { ...CHECKOUT, pickup_slot: '12:00' })).rejects.toThrow('pickup time')
    await expect(createPendingOrderCore('org-1', DROP, { ...CHECKOUT, buyer: { name: 'J', email: 'not-an-email' } })).rejects.toThrow('email')
  })
})

describe('confirmOrderCore', () => {
  beforeEach(() => vi.clearAllMocks())
  const PAY = { intent_id: 'pi_1', paid_at: '2026-08-20T16:00:00.000Z' }

  it('assigns the next per-drop number transactionally and confirms', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'pending' }) })
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', order_seq: 7 }) })
    const { order, confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(true)
    expect(order.number).toBe(8)
    expect(order.status).toBe('confirmed')
    // both the drop counter and the order are written in the same transaction
    expect(txSetSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'drop' }), expect.objectContaining({ order_seq: 8 }), { merge: true })
    expect(txSetSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'order' }), expect.objectContaining({ status: 'confirmed', number: 8, payment: PAY }), { merge: true })
  })

  it('is idempotent: already-confirmed orders return confirmedNow:false with no writes', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'confirmed', number: 8 }) })
    const { confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(false)
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('refunded orders are not resurrected by a late success webhook', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', drop_id: 'd1', status: 'refunded' }) })
    const { confirmedNow } = await confirmOrderCore('org-1', 'o1', PAY)
    expect(confirmedNow).toBe(false)
    expect(txSetSpy).not.toHaveBeenCalled()
  })
})

describe('status transitions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('markPickedUpCore requires confirmed; markRefundedCore is idempotent', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'confirmed' }) })
    await markPickedUpCore('org-1', 'o1')
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'picked_up' }))

    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'pending' }) })
    await expect(markPickedUpCore('org-1', 'o1')).rejects.toThrow('confirmed')

    const REFUND = { refund_id: 're_1', amount: 5.5, refunded_at: 'x' }
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'refunded', refund: REFUND }) })
    orderUpdateSpy.mockClear()
    await markRefundedCore('org-1', 'o1', REFUND)
    expect(orderUpdateSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/storefront/orders.test.ts --exclude '**/.claude/**'`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `lib/storefront/orders.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { dropsRef } from '@/lib/storefront/drops'
import {
  cartFits, computeOrderTotals, dropPhase, soldByProduct,
  PENDING_HOLD_MS, type CartLine,
} from '@/lib/storefront/drop-logic'
import type { Drop, Order, OrderPayment, OrderRefund } from '@/lib/types'

export interface CheckoutInput {
  cart: CartLine[]
  buyer: { name: string; email: string; phone?: string }
  pickup_window_id: string
  pickup_slot?: string
  tip?: number
}

export function ordersRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('orders')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLOT_RE = /^\d{2}:\d{2}$/

/**
 * Guard-free checkout write. Validates everything server-side, then a single
 * transaction re-reads all orders for the drop, derives availability (spec
 * §5.3 — unexpired pending holds count as sold), and creates the pending
 * order. Two concurrent checkouts for the last unit cannot both pass: the
 * transaction's read set covers the query.
 */
export async function createPendingOrderCore(orgId: string, drop: Drop, input: CheckoutInput): Promise<Order> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  if (dropPhase(drop, nowIso) !== 'open') throw new Error('Sales are not open for this drop')

  const window = drop.pickup.windows.find((w) => w.id === input.pickup_window_id)
  if (!window) throw new Error('Please choose a pickup window')
  if (window.slot_minutes) {
    const slot = input.pickup_slot
    if (!slot || !SLOT_RE.test(slot) || slot < window.start || slot >= window.end) {
      throw new Error('Please choose a pickup time')
    }
  }

  const name = input.buyer.name?.trim()
  const email = input.buyer.email?.trim()
  const phone = input.buyer.phone?.trim()
  if (!name || name.length > 200) throw new Error('Please enter your name')
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) throw new Error('Please enter a valid email')
  if (phone && phone.length > 50) throw new Error('Please enter a valid phone number')

  const totals = computeOrderTotals(drop.items, input.cart, { tax_rate: drop.tax_rate, tip: input.tip })
  const order: Order = {
    id: randomBytes(8).toString('hex'),
    org_id: orgId,
    channel: 'drop',
    drop_id: drop.id,
    status: 'pending',
    expires_at: new Date(nowMs + PENDING_HOLD_MS).toISOString(),
    buyer: { name, email, ...(phone ? { phone } : {}) },
    lines: totals.lines,
    pickup_window_id: window.id,
    ...(window.slot_minutes && input.pickup_slot ? { pickup_slot: input.pickup_slot } : {}),
    subtotal: totals.subtotal,
    ...(totals.tax_rate !== undefined ? { tax_rate: totals.tax_rate } : {}),
    tax: totals.tax,
    ...(totals.tip > 0 ? { tip: totals.tip } : {}),
    total: totals.total,
    token: generateAccessToken(),
    created_at: nowIso,
  }

  // Single-field auto-index on drop_id; status/expiry filtered in code so no
  // composite index is needed (per-drop order volume is small).
  const query = ordersRef(orgId).where('drop_id', '==', drop.id)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(query)
    const existing = snap.docs.map((d) => d.data() as Order)
    const fit = cartFits(drop.items, input.cart, soldByProduct(existing, nowIso))
    if (!fit.ok) throw new Error(`Sold out: ${fit.name}`)
    tx.set(ordersRef(orgId).doc(order.id), order)
    return order
  })
}

/**
 * Webhook-driven confirm. Idempotent: only a pending order transitions; the
 * per-drop pickup number and the order write share one transaction. A late
 * success after a refund is a no-op (the refund won).
 */
export async function confirmOrderCore(
  orgId: string,
  orderId: string,
  payment: OrderPayment,
): Promise<{ order: Order; confirmedNow: boolean }> {
  const orderRef = ordersRef(orgId).doc(orderId)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef)
    if (!snap.exists) throw new Error('Order not found')
    const order = snap.data() as Order
    if (order.status !== 'pending') return { order, confirmedNow: false }

    const dropRef = dropsRef(orgId).doc(order.drop_id)
    const dropSnap = await tx.get(dropRef)
    const seq = ((dropSnap.exists ? (dropSnap.data() as Drop).order_seq : 0) ?? 0) + 1
    const now = new Date().toISOString()
    tx.set(dropRef, { order_seq: seq, updated_at: now }, { merge: true })
    tx.set(orderRef, { status: 'confirmed', number: seq, payment, updated_at: now }, { merge: true })
    return { order: { ...order, status: 'confirmed', number: seq, payment, updated_at: now }, confirmedNow: true }
  })
}

export async function listOrdersForDropCore(orgId: string, dropId: string): Promise<Order[]> {
  const snap = await ordersRef(orgId).where('drop_id', '==', dropId).get()
  return snap.docs
    .map((d) => d.data() as Order)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** Public status page resolver (token = authorization). */
export async function getOrderByTokenCore(token: string): Promise<Order | null> {
  if (!token || token.length > 100) return null
  const snap = await adminDb.collectionGroup('orders').where('token', '==', token).limit(1).get()
  return snap.empty ? null : (snap.docs[0].data() as Order)
}

export async function markPickedUpCore(orgId: string, orderId: string): Promise<void> {
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  if ((snap.data() as Order).status !== 'confirmed') throw new Error('Only confirmed orders can be picked up')
  await ordersRef(orgId).doc(orderId).update({ status: 'picked_up', updated_at: new Date().toISOString() })
}

/** Idempotent — safe under webhook retries and dashboard-refund reconciliation. */
export async function markRefundedCore(orgId: string, orderId: string, refund: OrderRefund): Promise<void> {
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  const order = snap.data() as Order
  if (order.status === 'refunded') return
  await ordersRef(orgId).doc(orderId).update({ status: 'refunded', refund, updated_at: new Date().toISOString() })
}

/** Best-effort cleanup when PaymentIntent creation fails after the hold was written. */
export async function deletePendingOrderCore(orgId: string, orderId: string): Promise<void> {
  await ordersRef(orgId).doc(orderId).delete().catch(() => {})
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/storefront/orders.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storefront/orders.ts __tests__/lib/storefront/orders.test.ts
git commit -m "feat(drops): orders core — pending hold, transactional confirm, refund"
```

---

### Task 6: Email templates — order confirmation + drop announcement

**Files:**
- Modify: `lib/email.ts` (append two exports; follow the `sendIntakeNotification` template shape and `escapeHtml` discipline)
- Test: `__tests__/lib/email.test.ts` (extend)

**Interfaces:**
- Consumes: `getResend`, `buildFromAddress` from `@/lib/resend` (already imported at the top of `lib/email.ts`); module constant `PROPOSAL_BASE_URL` (reuse it for links — do not add a new base-URL constant).
- Produces: `sendOrderConfirmation(params: OrderConfirmationParams): Promise<void>` and `buildDropAnnouncementEmail(params: DropAnnouncementParams): { from: string; to: string; subject: string; html: string }` — the announcement returns a payload (callers batch it via `resend.batch.send`, communicate.ts pattern), the confirmation sends directly.

- [ ] **Step 1: Write the failing tests** — append to `__tests__/lib/email.test.ts`, matching that file's existing resend mock (it mocks `@/lib/resend` with a `getResend` spy; follow the shape already present in the file):

```ts
import { sendOrderConfirmation, buildDropAnnouncementEmail } from '@/lib/email'

describe('sendOrderConfirmation', () => {
  it('sends from the org display name, includes pickup number/lines/total, links the status page, escapes HTML', async () => {
    await sendOrderConfirmation({
      to: 'jane@example.com',
      buyerName: 'Jane <script>',
      orgDisplayName: 'Love & Co',
      dropTitle: 'Weekend Drop',
      orderNumber: 8,
      pickupLabel: 'Sat, Aug 22 · 08:00–11:00 · SW Boise',
      lines: [{ name: 'Vanilla <b>Latte</b>', qty: 2, price: 5.5 }],
      total: 11,
      orderUrl: 'https://traxevent.com/orders/tok123',
    })
    const call = sendSpy.mock.calls[0][0]   // reuse the file's existing send spy
    expect(call.to).toBe('jane@example.com')
    expect(call.subject).toContain('#8')
    expect(call.html).toContain('https://traxevent.com/orders/tok123')
    expect(call.html).toContain('Vanilla &lt;b&gt;Latte&lt;/b&gt;')
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('$11.00')
  })
})

describe('buildDropAnnouncementEmail', () => {
  it('returns a batchable payload with drop + unsubscribe links', () => {
    const p = buildDropAnnouncementEmail({
      to: 'fan@example.com',
      orgDisplayName: 'Love Brew',
      dropTitle: 'Weekend Drop',
      opensLabel: 'Sat, Aug 22 at 8:00 AM',
      dropUrl: 'https://traxevent.com/p/lovebrew/drops/d1',
      unsubscribeUrl: 'https://traxevent.com/unsubscribe/tok456',
    })
    expect(p.to).toBe('fan@example.com')
    expect(p.subject).toContain('Weekend Drop')
    expect(p.html).toContain('https://traxevent.com/p/lovebrew/drops/d1')
    expect(p.html).toContain('https://traxevent.com/unsubscribe/tok456')
  })
})
```

(If `__tests__/lib/email.test.ts` names its send spy differently, use that file's existing spy name — do not add a second mock of `@/lib/resend`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/email.test.ts --exclude '**/.claude/**'`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** — append to `lib/email.ts`:

```ts
export interface OrderConfirmationParams {
  to: string
  buyerName: string
  orgDisplayName: string
  dropTitle: string
  orderNumber: number
  pickupLabel: string
  lines: Array<{ name: string; qty: number; price: number }>
  total: number
  orderUrl: string
  fromDomain?: string
}

// Best-effort order receipt — the webhook wraps this in try/catch; a send
// failure must never fail the confirmed order write.
export async function sendOrderConfirmation(params: OrderConfirmationParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.orgDisplayName, domain: params.fromDomain })
  const rowsHtml = params.lines
    .map(
      (l) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#1a1a1a;font-size:14px">${l.qty} × ${escapeHtml(l.name)}</td>
          <td style="padding:6px 0;color:#64748B;font-size:14px;text-align:right">$${(l.price * l.qty).toFixed(2)}</td>
        </tr>`
    )
    .join('')
  await getResend().emails.send({
    from,
    to: params.to,
    subject: `Order #${params.orderNumber} confirmed — ${params.dropTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;margin-bottom:8px">You're all set, ${escapeHtml(params.buyerName)}</h1>
        <p style="color:#4b5563;font-size:16px;margin-bottom:4px">Pickup number <strong>#${params.orderNumber}</strong></p>
        <p style="color:#4b5563;font-size:14px;margin-bottom:16px">${escapeHtml(params.pickupLabel)}</p>
        <table style="border-collapse:collapse;width:100%;margin-bottom:8px">${rowsHtml}</table>
        <p style="color:#1a1a1a;font-size:16px;font-weight:600;margin-bottom:24px">Total $${params.total.toFixed(2)}</p>
        <a href="${params.orderUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View your order
        </a>
      </div>
    `,
  })
}

export interface DropAnnouncementParams {
  to: string
  orgDisplayName: string
  dropTitle: string
  opensLabel: string
  dropUrl: string
  unsubscribeUrl: string
  fromDomain?: string
}

// Returns a resend.batch.send payload — publishDrop batches these in chunks
// of 100 (actions/communicate.ts pattern).
export function buildDropAnnouncementEmail(params: DropAnnouncementParams): {
  from: string; to: string; subject: string; html: string
} {
  const from = buildFromAddress({ displayName: params.orgDisplayName, domain: params.fromDomain })
  return {
    from,
    to: params.to,
    subject: `${params.dropTitle} — orders open ${params.opensLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;margin-bottom:8px">${escapeHtml(params.dropTitle)}</h1>
        <p style="color:#4b5563;font-size:16px;margin-bottom:24px">
          ${escapeHtml(params.orgDisplayName)} just scheduled a new drop. Orders open ${escapeHtml(params.opensLabel)}.
        </p>
        <a href="${params.dropUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          See the menu
        </a>
        <p style="margin-top:32px;font-size:12px;color:#9ca3af">
          <a href="${params.unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a> from drop reminders.
        </p>
      </div>
    `,
  }
}
```

Note: `buildDropAnnouncementEmail` is a sync non-async export in `lib/email.ts` — that file is NOT a `'use server'` module (verify its top before editing; it has no directive), so a sync export is safe.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/email.test.ts --exclude '**/.claude/**'`
Expected: PASS (all pre-existing tests too).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts __tests__/lib/email.test.ts
git commit -m "feat(drops): order confirmation + drop announcement emails"
```

---

### Task 7: Public storefront actions + index overrides + reserved handles

**Files:**
- Create: `actions/storefront-public.ts`
- Modify: `firestore.indexes.json` (fieldOverrides), `lib/public-profile.ts` (RESERVED_HANDLES)
- Test: `__tests__/actions/storefront-public.test.ts`

**Interfaces:**
- Consumes: `getOrgByHandle` from `@/lib/public-profile-server`; `getDropCore`, `listOrdersForDropCore`, `getOrderByTokenCore` (Tasks 4–5); `dropPhase`, `soldByProduct`, `availableStock` (Task 2); `checkRateLimit` from `@/lib/rate-limit`; `findOrCreateCustomerCore`, `customersRef` from `@/lib/crm/customers`; `generateAccessToken` from `@/lib/tokens`.
- Produces in `@/actions/storefront-public` (all `'use server'`, token/handle-authorized, hand-built projections):
  - `PublicDropItem { product_id; name; price; description?; photo_url?; sold_out: boolean }`
  - `PublicDrop { id; title; note?; phase: DropPhase; opens_at; closes_at; timezone; pickup: DropPickup; items: PublicDropItem[]; tips_enabled: boolean; tax_rate?: number; org: { display_name: string; handle: string; accent_color?: string } }`
  - `getPublicDrop(handle: string, dropId: string): Promise<PublicDrop | null>` — null for unknown handle/drop, disabled profile, `draft`/`archived` drops.
  - `PublicOrder { number?: number; status: OrderStatus; drop_title: string; pickup: { location_name: string; day: string; start: string; end: string; slot?: string }; lines: OrderLine[]; subtotal: number; tax: number; tip?: number; total: number; buyer_name: string }`
  - `getPublicOrder(token: string): Promise<PublicOrder | null>`
  - `subscribeToDrops(handle: string, input: { name?: string; email: string; website?: string }, elapsedMs: number): Promise<{ ok: true }>` — honeypot + 3s time gate (fake success), per-IP 10/hr + per-org 100/hr rate limits.
  - `unsubscribeByToken(token: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: Update config first (no test):**

In `lib/public-profile.ts`, extend `RESERVED_HANDLES` with `'orders', 'unsubscribe', 'drops', 'products', 'drop-orders'` (the existing test iterates the set — no test change needed).

In `firestore.indexes.json`, append to `fieldOverrides`, mirroring the `proposals.token` entry exactly:

```json
{
  "collectionGroup": "orders",
  "fieldPath": "token",
  "indexes": [
    { "queryScope": "COLLECTION", "order": "ASCENDING" },
    { "queryScope": "COLLECTION", "order": "DESCENDING" },
    { "queryScope": "COLLECTION", "arrayConfig": "CONTAINS" },
    { "queryScope": "COLLECTION_GROUP", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "customers",
  "fieldPath": "marketing.unsubscribe_token",
  "indexes": [
    { "queryScope": "COLLECTION", "order": "ASCENDING" },
    { "queryScope": "COLLECTION", "order": "DESCENDING" },
    { "queryScope": "COLLECTION", "arrayConfig": "CONTAINS" },
    { "queryScope": "COLLECTION_GROUP", "order": "ASCENDING" }
  ]
}
```

(These enable `collectionGroup('orders').where('token'…)` and `collectionGroup('customers').where('marketing.unsubscribe_token'…)`. Deploy note for the ship checklist: `firebase deploy --only firestore:indexes`.)

- [ ] **Step 2: Write the failing tests** — `__tests__/actions/storefront-public.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrgByHandleSpy = vi.hoisted(() => vi.fn())
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const listOrdersSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const getOrderByTokenSpy = vi.hoisted(() => vi.fn())
const checkRateLimitSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }))
const findOrCreateSpy = vi.hoisted(() => vi.fn())
const customerUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const unsubQueryGetSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ get: () => '1.2.3.4' }))

vi.mock('@/lib/public-profile-server', () => ({ getOrgByHandle: getOrgByHandleSpy }))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/storefront/orders', () => ({ listOrdersForDropCore: listOrdersSpy, getOrderByTokenCore: getOrderByTokenSpy }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/crm/customers', () => ({
  findOrCreateCustomerCore: findOrCreateSpy,
  customersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: customerUpdateSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: unsubQueryGetSpy }) }),
    }),
  },
}))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { getPublicDrop, getPublicOrder, subscribeToDrops, unsubscribeByToken } from '@/actions/storefront-public'

const ORG = {
  id: 'org-1', name: 'Love Brew LLC', tips_enabled: true,
  branding: { display_name: 'Love Brew', accent_color: '#78350f' },
  public_profile: { enabled: true, handle: 'lovebrew', links: [] },
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled',
  opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 1 }],
  channels: ['email'], order_seq: 3, created_at: 'x',
}

describe('getPublicDrop', () => {
  beforeEach(() => { vi.clearAllMocks(); listOrdersSpy.mockResolvedValue([]) })

  it('projects the drop with derived phase and sold_out flags; strips stock counts and internals', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(DROP)
    listOrdersSpy.mockResolvedValue([{ status: 'confirmed', lines: [{ product_id: 'p1', qty: 1 }] }])
    const out = await getPublicDrop('lovebrew', 'd1')
    expect(out!.phase).toBe('open')
    expect(out!.items[0]).toEqual({ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, sold_out: true })
    expect(out!.org).toEqual({ display_name: 'Love Brew', handle: 'lovebrew', accent_color: '#78350f' })
    expect(out).not.toHaveProperty('order_seq')
    expect(out).not.toHaveProperty('channels')
    expect(JSON.stringify(out)).not.toContain('"stock"')
  })

  it('returns null for unknown handle, unknown drop, and draft/archived drops', async () => {
    getOrgByHandleSpy.mockResolvedValue(null)
    expect(await getPublicDrop('nope', 'd1')).toBeNull()
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(null)
    expect(await getPublicDrop('lovebrew', 'd1')).toBeNull()
    getDropCoreSpy.mockResolvedValue({ ...DROP, status: 'draft' })
    expect(await getPublicDrop('lovebrew', 'd1')).toBeNull()
  })
})

describe('getPublicOrder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('projects status page fields and never leaks token/org_id/customer_id', async () => {
    getOrderByTokenSpy.mockResolvedValue({
      id: 'o1', org_id: 'org-1', drop_id: 'd1', status: 'confirmed', number: 8,
      buyer: { name: 'Jane', email: 'jane@example.com' },
      lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
      pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 'tok', created_at: 'x',
    })
    getDropCoreSpy.mockResolvedValue(DROP)
    const out = await getPublicOrder('tok')
    expect(out!.number).toBe(8)
    expect(out!.pickup).toEqual({ location_name: 'SW Boise', day: '2026-08-22', start: '08:00', end: '11:00' })
    const json = JSON.stringify(out)
    expect(json).not.toContain('org-1')
    expect(json).not.toContain('"token"')
    expect(json).not.toContain('jane@example.com')   // buyer_name only
  })

  it('returns null for unknown tokens', async () => {
    getOrderByTokenSpy.mockResolvedValue(null)
    expect(await getPublicOrder('nope')).toBeNull()
  })
})

describe('subscribeToDrops', () => {
  beforeEach(() => { vi.clearAllMocks(); checkRateLimitSpy.mockResolvedValue({ allowed: true }) })

  it('honeypot and time gate return fake success with zero writes', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    expect(await subscribeToDrops('lovebrew', { email: 'a@b.co', website: 'spam' }, 9999)).toEqual({ ok: true })
    expect(await subscribeToDrops('lovebrew', { email: 'a@b.co' }, 100)).toEqual({ ok: true })
    expect(findOrCreateSpy).not.toHaveBeenCalled()
  })

  it('subscribes: dedups the customer and writes marketing with a minted token', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    findOrCreateSpy.mockResolvedValue({ customer: { id: 'c1' }, created: true })
    await subscribeToDrops('lovebrew', { name: 'Jane', email: 'jane@example.com' }, 5000)
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ email: 'jane@example.com' }))
    const marketing = customerUpdateSpy.mock.calls[0][0].marketing
    expect(marketing.subscribed).toBe(true)
    expect(marketing.unsubscribe_token).toHaveLength(48)
  })

  it('keeps an existing unsubscribe_token on resubscribe', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    findOrCreateSpy.mockResolvedValue({
      customer: { id: 'c1', marketing: { subscribed: false, subscribed_at: 'x', source: 'profile', unsubscribe_token: 'K'.repeat(48) } },
      created: false,
    })
    await subscribeToDrops('lovebrew', { email: 'jane@example.com' }, 5000)
    expect(customerUpdateSpy.mock.calls[0][0].marketing.unsubscribe_token).toBe('K'.repeat(48))
  })

  it('rate-limits and rejects invalid emails', async () => {
    getOrgByHandleSpy.mockResolvedValue(ORG)
    checkRateLimitSpy.mockResolvedValue({ allowed: false })
    await expect(subscribeToDrops('lovebrew', { email: 'jane@example.com' }, 5000)).rejects.toThrow('Too many')
    checkRateLimitSpy.mockResolvedValue({ allowed: true })
    await expect(subscribeToDrops('lovebrew', { email: 'nope' }, 5000)).rejects.toThrow('email')
  })
})

describe('unsubscribeByToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flips subscribed to false; unknown tokens report ok:false without throwing', async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined)
    unsubQueryGetSpy.mockResolvedValue({ empty: false, docs: [{ ref: { update: updateSpy } }] })
    expect(await unsubscribeByToken('T'.repeat(48))).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ 'marketing.subscribed': false }))
    unsubQueryGetSpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await unsubscribeByToken('nope')).toEqual({ ok: false })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/actions/storefront-public.test.ts --exclude '**/.claude/**'`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement** `actions/storefront-public.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getDropCore } from '@/lib/storefront/drops'
import { getOrderByTokenCore, listOrdersForDropCore } from '@/lib/storefront/orders'
import { availableStock, dropPhase, soldByProduct } from '@/lib/storefront/drop-logic'
import { checkRateLimit } from '@/lib/rate-limit'
import { customersRef, findOrCreateCustomerCore } from '@/lib/crm/customers'
import { generateAccessToken } from '@/lib/tokens'
import type { Customer, DropPhase, DropPickup, OrderLine, OrderStatus } from '@/lib/types'

// NOTE: 'use server' module — every export must be an async function; types
// used by callers live here as interfaces only (never re-exported types).

const MSG_RATE_LIMITED = 'Too many requests — please try again later.'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PublicDropItem {
  product_id: string
  name: string
  price: number
  description?: string
  photo_url?: string
  sold_out: boolean
}

export interface PublicDrop {
  id: string
  title: string
  note?: string
  phase: DropPhase
  opens_at: string
  closes_at: string
  timezone: string
  pickup: DropPickup
  items: PublicDropItem[]
  tips_enabled: boolean
  tax_rate?: number
  org: { display_name: string; handle: string; accent_color?: string }
}

// PUBLIC (handle + dropId = the shareable marketing URL). Only scheduled /
// closed drops are visible; stock COUNTS never leave the server — only a
// sold_out boolean per item (spec §4).
export async function getPublicDrop(handle: string, dropId: string): Promise<PublicDrop | null> {
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile?.handle) return null
  const drop = await getDropCore(org.id, dropId)
  if (!drop || drop.status === 'draft' || drop.status === 'archived') return null

  const nowIso = new Date().toISOString()
  const orders = await listOrdersForDropCore(org.id, drop.id)
  const sold = soldByProduct(orders, nowIso)
  const items: PublicDropItem[] = drop.items.map((i) => {
    const avail = availableStock(i, sold)
    return {
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      ...(i.description ? { description: i.description } : {}),
      ...(i.photo_url ? { photo_url: i.photo_url } : {}),
      sold_out: avail !== null && avail <= 0,
    }
  })
  const out: PublicDrop = {
    id: drop.id,
    title: drop.title,
    ...(drop.note ? { note: drop.note } : {}),
    phase: dropPhase(drop, nowIso),
    opens_at: drop.opens_at,
    closes_at: drop.closes_at,
    timezone: drop.timezone,
    pickup: drop.pickup,
    items,
    tips_enabled: org.tips_enabled ?? false,
    ...(drop.tax_rate !== undefined ? { tax_rate: drop.tax_rate } : {}),
    org: {
      display_name: org.branding?.display_name || org.name,
      handle: org.public_profile.handle,
      ...(org.branding?.accent_color ? { accent_color: org.branding.accent_color } : {}),
    },
  }
  return out
}

export interface PublicOrder {
  number?: number
  status: OrderStatus
  drop_title: string
  pickup: { location_name: string; day: string; start: string; end: string; slot?: string }
  lines: OrderLine[]
  subtotal: number
  tax: number
  tip?: number
  total: number
  buyer_name: string
}

// PUBLIC (token = authorization). Omits buyer email/phone, token, org_id,
// customer_id, payment/refund internals.
export async function getPublicOrder(token: string): Promise<PublicOrder | null> {
  const order = await getOrderByTokenCore(token)
  if (!order) return null
  const drop = await getDropCore(order.org_id, order.drop_id)
  const window = drop?.pickup.windows.find((w) => w.id === order.pickup_window_id)
  return {
    ...(order.number !== undefined ? { number: order.number } : {}),
    status: order.status,
    drop_title: drop?.title ?? 'Drop',
    pickup: {
      location_name: drop?.pickup.location_name ?? '',
      day: window?.day ?? '',
      start: window?.start ?? '',
      end: window?.end ?? '',
      ...(order.pickup_slot ? { slot: order.pickup_slot } : {}),
    },
    lines: order.lines,
    subtotal: order.subtotal,
    tax: order.tax,
    ...(order.tip !== undefined ? { tip: order.tip } : {}),
    total: order.total,
    buyer_name: order.buyer.name,
  }
}

// PUBLIC subscribe (spec §3.4): honeypot + time gate return an
// indistinguishable fake success with zero writes; rate-limited per-IP and
// per-org; subscriber lands in the CRM via the same dedup core as intake.
export async function subscribeToDrops(
  handle: string,
  input: { name?: string; email: string; website?: string },
  elapsedMs: number,
): Promise<{ ok: true }> {
  const org = await getOrgByHandle(handle)
  if (!org) throw new Error('This page is no longer available.')

  if (input.website?.trim() || !(elapsedMs >= 3000)) return { ok: true }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const [byIp, byOrg] = await Promise.all([
    checkRateLimit(`subscribe:ip:${ipHash}`, { limit: 10, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`subscribe:org:${org.id}`, { limit: 100, windowMs: 60 * 60 * 1000 }),
  ])
  if (!byIp.allowed || !byOrg.allowed) throw new Error(MSG_RATE_LIMITED)

  const email = (input.email ?? '').trim()
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.')
  const name = (input.name ?? '').trim().slice(0, 200) || email.split('@')[0]

  const { customer } = await findOrCreateCustomerCore(org.id, { name, email })
  const existing = (customer as Customer).marketing
  await customersRef(org.id).doc(customer.id).update({
    marketing: {
      subscribed: true,
      subscribed_at: new Date().toISOString(),
      source: 'profile',
      unsubscribe_token: existing?.unsubscribe_token ?? generateAccessToken(),
    },
    updated_at: new Date().toISOString(),
  })
  return { ok: true }
}

// PUBLIC one-click unsubscribe. Uniform ok:false for unknown tokens.
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  if (!token || token.length > 100) return { ok: false }
  const snap = await adminDb
    .collectionGroup('customers')
    .where('marketing.unsubscribe_token', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return { ok: false }
  await snap.docs[0].ref.update({ 'marketing.subscribed': false, updated_at: new Date().toISOString() })
  return { ok: true }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/actions/storefront-public.test.ts __tests__/lib/public-profile.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add actions/storefront-public.ts lib/public-profile.ts firestore.indexes.json __tests__/actions/storefront-public.test.ts
git commit -m "feat(drops): public drop/order projections, subscribe/unsubscribe, index overrides"
```

---

### Task 8: Checkout intent route

**Files:**
- Create: `app/api/payments/drop-order/intent/route.ts`
- Test: `__tests__/api/drop-order-intent.test.ts`

**Interfaces:**
- Consumes: `getOrgByHandle`; `getDropCore`; `createPendingOrderCore`, `deletePendingOrderCore` (Task 5); `checkRateLimit`; `stripe` from `@/lib/stripe`.
- Produces: `POST /api/payments/drop-order/intent` accepting `{ handle, drop_id, cart, buyer: { name, email, phone? }, pickup_window_id, pickup_slot?, tip? }`, returning `{ clientSecret, stripeAccountId, orderToken }` or `{ error }`. PaymentIntent metadata: `{ purpose: 'drop_order', order_id, org_id }` — **no `application_fee_amount`** (Global Constraints). Consumed by Task 9 (webhook reads that metadata) and Task 11 (client).

- [ ] **Step 1: Write the failing tests** — `__tests__/api/drop-order-intent.test.ts` (route-test pattern from `__tests__/api/proposal-deposit-intent.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getOrgByHandleSpy = vi.hoisted(() => vi.fn())
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const createPendingSpy = vi.hoisted(() => vi.fn())
const deletePendingSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const piCreateSpy = vi.hoisted(() => vi.fn())
const checkRateLimitSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }))
const getHeadersSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ get: () => '1.2.3.4' }))

vi.mock('@/lib/public-profile-server', () => ({ getOrgByHandle: getOrgByHandleSpy }))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/storefront/orders', () => ({ createPendingOrderCore: createPendingSpy, deletePendingOrderCore: deletePendingSpy }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { create: piCreateSpy } } }))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { POST } from '@/app/api/payments/drop-order/intent/route'

const ORG = { id: 'org-1', name: 'Love Brew', stripe_account_id: 'acct_1', public_profile: { enabled: true, handle: 'lovebrew' } }
const DROP = { id: 'd1', status: 'scheduled', opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z', items: [], pickup: { location_name: 'x', windows: [] }, channels: [], timezone: 'UTC', title: 'Drop', created_at: 'x' }
const ORDER = { id: 'o1', token: 'T'.repeat(48), total: 18.43, org_id: 'org-1' }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/payments/drop-order/intent', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const BODY = {
  handle: 'lovebrew', drop_id: 'd1',
  cart: [{ product_id: 'p1', qty: 2 }],
  buyer: { name: 'Jane', email: 'jane@example.com' },
  pickup_window_id: 'w1', tip: 2,
}

describe('POST /api/payments/drop-order/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimitSpy.mockResolvedValue({ allowed: true })
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(DROP)
    createPendingSpy.mockResolvedValue(ORDER)
    piCreateSpy.mockResolvedValue({ id: 'pi_1', client_secret: 'cs_1' })
  })

  it('creates the pending order then a PI on the connected account with NO application fee', async () => {
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clientSecret: 'cs_1', stripeAccountId: 'acct_1', orderToken: 'T'.repeat(48) })
    const [piArgs, piOpts] = piCreateSpy.mock.calls[0]
    expect(piArgs.amount).toBe(1843)
    expect(piArgs).not.toHaveProperty('application_fee_amount')
    expect(piArgs.metadata).toEqual({ purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' })
    expect(piOpts).toEqual({ stripeAccount: 'acct_1' })
  })

  it('404s unknown handles/drops; 400s when Stripe is not connected or the drop is not open', async () => {
    getOrgByHandleSpy.mockResolvedValue(null)
    expect((await POST(makeRequest(BODY))).status).toBe(404)
    getOrgByHandleSpy.mockResolvedValue({ ...ORG, stripe_account_id: undefined })
    expect((await POST(makeRequest(BODY))).status).toBe(400)
    getOrgByHandleSpy.mockResolvedValue(ORG)
    getDropCoreSpy.mockResolvedValue(null)
    expect((await POST(makeRequest(BODY))).status).toBe(404)
  })

  it('maps checkout-validation errors (sold out, closed) to 400 with the message', async () => {
    createPendingSpy.mockRejectedValue(new Error('Sold out: Vanilla Latte'))
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Sold out: Vanilla Latte')
    expect(piCreateSpy).not.toHaveBeenCalled()
  })

  it('rate-limits checkout attempts', async () => {
    checkRateLimitSpy.mockResolvedValue({ allowed: false })
    expect((await POST(makeRequest(BODY))).status).toBe(429)
    expect(createPendingSpy).not.toHaveBeenCalled()
  })

  it('cleans up the pending hold when PI creation fails', async () => {
    piCreateSpy.mockRejectedValue(new Error('stripe down'))
    const res = await POST(makeRequest(BODY))
    expect(res.status).toBe(502)
    expect(deletePendingSpy).toHaveBeenCalledWith('org-1', 'o1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/drop-order-intent.test.ts --exclude '**/.claude/**'`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement** `app/api/payments/drop-order/intent/route.ts`:

```ts
// Drop-order checkout: pending-order hold + PaymentIntent on the org's
// connected account. NO application_fee_amount — monetization is the monthly
// subscription (spec 2026-08-15 §1 decision 2).
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { stripe } from '@/lib/stripe'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getDropCore } from '@/lib/storefront/drops'
import { createPendingOrderCore, deletePendingOrderCore } from '@/lib/storefront/orders'
import { checkRateLimit } from '@/lib/rate-limit'
import type { CartLine } from '@/lib/storefront/drop-logic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const handle = typeof body?.handle === 'string' ? body.handle : ''
  const dropId = typeof body?.drop_id === 'string' ? body.drop_id : ''
  if (!handle || !dropId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const rl = await checkRateLimit(`checkout:ip:${ipHash}`, { limit: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429 })

  const org = await getOrgByHandle(handle)
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!org.stripe_account_id) {
    return NextResponse.json({ error: 'This shop is not accepting card payments yet' }, { status: 400 })
  }
  const drop = await getDropCore(org.id, dropId)
  if (!drop) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cart = Array.isArray(body?.cart) ? (body.cart as CartLine[]) : []
  let order
  try {
    order = await createPendingOrderCore(org.id, drop, {
      cart,
      buyer: {
        name: typeof body?.buyer?.name === 'string' ? body.buyer.name : '',
        email: typeof body?.buyer?.email === 'string' ? body.buyer.email : '',
        ...(typeof body?.buyer?.phone === 'string' && body.buyer.phone ? { phone: body.buyer.phone } : {}),
      },
      pickup_window_id: typeof body?.pickup_window_id === 'string' ? body.pickup_window_id : '',
      ...(typeof body?.pickup_slot === 'string' ? { pickup_slot: body.pickup_slot } : {}),
      ...(typeof body?.tip === 'number' ? { tip: body.tip } : {}),
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start checkout' },
      { status: 400 },
    )
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(order.total * 100),
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { purpose: 'drop_order', order_id: order.id, org_id: org.id },
      },
      { stripeAccount: org.stripe_account_id },
    )
    if (!paymentIntent.client_secret) throw new Error('Payment intent has no client secret')
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: org.stripe_account_id,
      orderToken: order.token,
    })
  } catch (err: unknown) {
    // Release the hold — otherwise the buyer's items stay reserved 15 minutes
    // for a payment that can never happen.
    await deletePendingOrderCore(org.id, order.id)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment' },
      { status: 502 },
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/drop-order-intent.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/payments/drop-order/intent/route.ts __tests__/api/drop-order-intent.test.ts
git commit -m "feat(drops): checkout intent route — pending hold + connected-account PI, no platform fee"
```

---

### Task 9: Webhook — confirm drop orders, reconcile refunds

**Files:**
- Modify: `app/api/payments/webhook/route.ts`
- Test: `__tests__/api/payments-webhook-drops.test.ts` (new file — the existing webhook test stays untouched)

**Interfaces:**
- Consumes: `confirmOrderCore`, `ordersRef`, `markRefundedCore` (Task 5); `getDropCore` (Task 4); `findOrCreateCustomerCore`; `logActivity`; `sendOrderConfirmation` (Task 6); `getVerifiedSendingDomain` from `@/actions/domains` (already imported in the route).
- Produces: the payments webhook now handles `payment_intent.succeeded` with `metadata.purpose === 'drop_order'` (before the proposal branch) and a new top-level `charge.refunded` event type. Durable writes first, best-effort CRM/email after — the deposit-webhook ordering discipline.

- [ ] **Step 1: Write the failing tests** — `__tests__/api/payments-webhook-drops.test.ts` (mock scaffolding copied from `__tests__/api/payments-webhook.test.ts`, plus the storefront mocks):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())
const confirmOrderSpy = vi.hoisted(() => vi.fn())
const markRefundedSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getDropCoreSpy = vi.hoisted(() => vi.fn())
const findOrCreateSpy = vi.hoisted(() => vi.fn())
const logActivitySpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const sendOrderConfirmationSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getVerifiedSendingDomainSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const piRetrieveSpy = vi.hoisted(() => vi.fn())
const familiesGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))
const proposalsGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }))

vi.mock('@/lib/storefront/orders', () => ({
  confirmOrderCore: confirmOrderSpy,
  markRefundedCore: markRefundedSpy,
  ordersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: orderUpdateSpy }) }),
}))
vi.mock('@/lib/storefront/drops', () => ({ getDropCore: getDropCoreSpy }))
vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore: findOrCreateSpy }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/email', () => ({
  sendOrderConfirmation: sendOrderConfirmationSpy,
  sendRegistrationConfirmation: vi.fn(),
  sendProposalSignedConfirmation: vi.fn(),
}))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: getVerifiedSendingDomainSpy }))
vi.mock('@/lib/crm/deposit-reconcile', () => ({ reconcileProposalDeposit: vi.fn() }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn((name: string) =>
      name === 'proposals'
        ? { where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: proposalsGetSpy }) }) }
        : { where: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: familiesGetSpy }) }) }
    ),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn(),
        // the drop-order branch reads the org doc for the email display name —
        // it must resolve or the best-effort catch swallows the email assert
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ name: 'Love Brew LLC', branding: { display_name: 'Love Brew' } }),
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: constructEventSpy }, paymentIntents: { retrieve: piRetrieveSpy } },
}))
vi.mock('next/headers', () => ({ headers: getHeadersSpy }))

import { POST } from '@/app/api/payments/webhook/route'

const ORDER = {
  id: 'o1', org_id: 'org-1', drop_id: 'd1', status: 'confirmed', number: 8,
  buyer: { name: 'Jane', email: 'jane@example.com', phone: '208' },
  lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
  pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 'tok', created_at: 'x',
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled', opens_at: 'x', closes_at: 'x', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [], channels: [], created_at: 'x',
}

function makeRequest() {
  return new Request('http://localhost/api/payments/webhook', { method: 'POST', body: '{}' })
}

describe('payments webhook — drop orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({ get: (k: string) => (k === 'stripe-signature' ? 'sig' : null) })
    getDropCoreSpy.mockResolvedValue(DROP)
    findOrCreateSpy.mockResolvedValue({ customer: { id: 'c1' }, created: true })
  })

  it('confirms the order, links the customer, logs activity, emails — in that order', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: true })
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1722500000, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(confirmOrderSpy).toHaveBeenCalledWith('org-1', 'o1', { intent_id: 'pi_1', paid_at: new Date(1722500000 * 1000).toISOString() })
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', { name: 'Jane', email: 'jane@example.com', phone: '208' })
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'c1' }))
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'order', parent_type: 'customer', parent_id: 'c1' }))
    expect(sendOrderConfirmationSpy).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', orderNumber: 8 }))
  })

  it('idempotent retry: confirmedNow=false skips CRM + email', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: false })
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(findOrCreateSpy).not.toHaveBeenCalled()
    expect(sendOrderConfirmationSpy).not.toHaveBeenCalled()
  })

  it('email failure still returns 200 (no Stripe retry storm)', async () => {
    confirmOrderSpy.mockResolvedValue({ order: ORDER, confirmedNow: true })
    sendOrderConfirmationSpy.mockRejectedValue(new Error('resend down'))
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', created: 1, metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
  })

  it('charge.refunded retrieves the PI on the connected account and marks the order refunded', async () => {
    piRetrieveSpy.mockResolvedValue({ id: 'pi_1', metadata: { purpose: 'drop_order', order_id: 'o1', org_id: 'org-1' } })
    constructEventSpy.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 1100, refunds: { data: [{ id: 're_1' }] } } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(piRetrieveSpy).toHaveBeenCalledWith('pi_1', { stripeAccount: 'acct_1' })
    expect(markRefundedSpy).toHaveBeenCalledWith('org-1', 'o1', expect.objectContaining({ refund_id: 're_1', amount: 11 }))
  })

  it('charge.refunded for a non-drop PI is a clean no-op', async () => {
    piRetrieveSpy.mockResolvedValue({ id: 'pi_1', metadata: { purpose: 'proposal_deposit' } })
    constructEventSpy.mockReturnValue({
      type: 'charge.refunded', account: 'acct_1',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 500 } },
    })
    expect((await POST(makeRequest())).status).toBe(200)
    expect(markRefundedSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/payments-webhook-drops.test.ts --exclude '**/.claude/**'`
Expected: FAIL — the webhook doesn't handle these cases.

- [ ] **Step 3: Implement.** In `app/api/payments/webhook/route.ts`:

Add imports:

```ts
import { confirmOrderCore, markRefundedCore, ordersRef } from '@/lib/storefront/orders'
import { getDropCore } from '@/lib/storefront/drops'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { logActivity } from '@/lib/activity'
import { sendOrderConfirmation } from '@/lib/email'   // merge into the existing @/lib/email import
```

Inside the `payment_intent.succeeded` branch, insert this block ABOVE the `proposal_deposit` handling:

```ts
    if (pi.metadata?.purpose === 'drop_order') {
      const orderId = pi.metadata.order_id
      const orgId = pi.metadata.org_id
      if (!orderId || !orgId) return new Response('ok')

      // Durable write first: transactional confirm + pickup-number assignment.
      // Everything after is best-effort and must not trigger Stripe retries.
      const { order, confirmedNow } = await confirmOrderCore(orgId, orderId, {
        intent_id: pi.id,
        paid_at: new Date(pi.created * 1000).toISOString(),
      })
      if (!confirmedNow) return new Response('ok')

      try {
        const { customer } = await findOrCreateCustomerCore(orgId, {
          name: order.buyer.name,
          email: order.buyer.email,
          ...(order.buyer.phone ? { phone: order.buyer.phone } : {}),
        })
        await ordersRef(orgId).doc(orderId).update({ customer_id: customer.id, updated_at: new Date().toISOString() })

        const drop = await getDropCore(orgId, order.drop_id)
        await logActivity(orgId, {
          parent_type: 'customer',
          parent_id: customer.id,
          kind: 'order',
          summary: `Order #${order.number} — ${drop?.title ?? 'drop'} ($${order.total.toFixed(2)})`,
        })

        const window = drop?.pickup.windows.find((w) => w.id === order.pickup_window_id)
        const pickupLabel = [
          window ? `${window.day} ${order.pickup_slot ?? `${window.start}–${window.end}`}` : '',
          drop?.pickup.location_name ?? '',
        ].filter(Boolean).join(' · ')
        let fromDomain: string | undefined
        try {
          fromDomain = await getVerifiedSendingDomain(orgId)
        } catch {
          // domain lookup failure should not block the email
        }
        const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
        const orgData = orgSnap.exists ? (orgSnap.data() as { name?: string; branding?: { display_name?: string } }) : {}
        await sendOrderConfirmation({
          to: order.buyer.email,
          buyerName: order.buyer.name,
          orgDisplayName: orgData.branding?.display_name || orgData.name || 'Your order',
          dropTitle: drop?.title ?? 'Drop',
          orderNumber: order.number!,
          pickupLabel,
          lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
          total: order.total,
          orderUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'}/orders/${order.token}`,
          ...(fromDomain ? { fromDomain } : {}),
        })
      } catch {
        // CRM/email are best-effort — the order is already confirmed
      }
      return new Response('ok')
    }
```

After the entire `payment_intent.succeeded` block (before the final `return new Response('ok')`), add the new event type:

```ts
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    const account = event.account   // connected-account events carry the acct id
    if (piId && account) {
      try {
        // Charge metadata is NOT copied from the PI — retrieve the PI on the
        // connected account to learn whether this refund belongs to a drop
        // order (covers refunds issued from the org's own Stripe dashboard).
        const pi = await stripe.paymentIntents.retrieve(piId, { stripeAccount: account })
        if (pi.metadata?.purpose === 'drop_order' && pi.metadata.order_id && pi.metadata.org_id) {
          await markRefundedCore(pi.metadata.org_id, pi.metadata.order_id, {
            refund_id: charge.refunds?.data?.[0]?.id ?? 'unknown',
            amount: (charge.amount_refunded ?? 0) / 100,
            refunded_at: new Date().toISOString(),
          })
        }
      } catch {
        // best-effort reconciliation — cancelOrder already wrote the primary record
      }
    }
    return new Response('ok')
  }
```

- [ ] **Step 4: Run tests to verify they pass — including the untouched legacy webhook suite**

Run: `npx vitest run __tests__/api/payments-webhook-drops.test.ts __tests__/api/payments-webhook.test.ts --exclude '**/.claude/**'`
Expected: PASS both files (the drop branch must not disturb deposit/registration behavior).

- [ ] **Step 5: Commit**

```bash
git add app/api/payments/webhook/route.ts __tests__/api/payments-webhook-drops.test.ts
git commit -m "feat(drops): webhook confirms drop orders and reconciles charge.refunded"
```

Ship-checklist note (not code): the Stripe Connect webhook endpoint must have `charge.refunded` added to its enabled events in the Stripe dashboard.

---

### Task 10: publishDrop action — gates + email announcement

**Files:**
- Modify: `actions/drops.ts` (add `publishDrop`)
- Test: `__tests__/actions/drops.test.ts` (new file)

**Interfaces:**
- Consumes: `publishDropCore` (Task 4); `buildDropAnnouncementEmail` (Task 6); `customersRef` from `@/lib/crm/customers`; `getResend` from `@/lib/resend`; `getVerifiedSendingDomain` from `@/actions/domains`; `dropsRef` (Task 4); org doc via `adminDb`.
- Produces: `publishDrop(orgId: string, dropId: string): Promise<Drop>` — gates: org must have `stripe_account_id` AND an enabled public profile handle (the public URL lives under `/p/[handle]`); flips draft → scheduled via the core; then, if `channels` includes `'email'` and `announced_at` is unset, best-effort: query subscribed customers, batch-send announcements (chunks of 100), stamp `announced_at`. Announcement failure never un-publishes.

- [ ] **Step 1: Write the failing tests** — `__tests__/actions/drops.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const publishDropCoreSpy = vi.hoisted(() => vi.fn())
const dropUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orgGetSpy = vi.hoisted(() => vi.fn())
const subsGetSpy = vi.hoisted(() => vi.fn())
const batchSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const getVerifiedSendingDomainSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))
vi.mock('@/lib/storefront/drops', () => ({
  publishDropCore: publishDropCoreSpy,
  dropsRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: dropUpdateSpy }) }),
  // passthroughs used by the other actions in this file:
  listDropsCore: vi.fn(), getDropCore: vi.fn(), createDropCore: vi.fn(), updateDraftDropCore: vi.fn(),
  closeDropCore: vi.fn(), archiveDropCore: vi.fn(), adjustStockCore: vi.fn(),
}))
vi.mock('@/lib/crm/customers', () => ({
  customersRef: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ get: subsGetSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orgGetSpy }) }) },
}))
vi.mock('@/lib/resend', () => ({
  getResend: () => ({ batch: { send: batchSendSpy } }),
  // the real lib/email builds announcement payloads with buildFromAddress —
  // it must exist here or the best-effort catch swallows the batch send
  buildFromAddress: (o: { displayName?: string }) => `"${o.displayName ?? 'x'}" <noreply@test>`,
}))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: getVerifiedSendingDomainSpy }))

import { publishDrop } from '@/actions/drops'

const ORG = {
  name: 'Love Brew LLC', stripe_account_id: 'acct_1',
  branding: { display_name: 'Love Brew' },
  public_profile: { enabled: true, handle: 'lovebrew' },
}
const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled', channels: ['email'],
  opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', timezone: 'UTC',
  pickup: { location_name: 'x', windows: [] }, items: [{ product_id: 'p1', name: 'x', price: 5 }], created_at: 'x',
}

describe('publishDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ORG })
    publishDropCoreSpy.mockResolvedValue(DROP)
    subsGetSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'c1', email: 'fan@example.com', marketing: { subscribed: true, unsubscribe_token: 'U'.repeat(48) } }) },
      ],
    })
  })

  it('gates on Stripe connection and public-profile handle', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...ORG, stripe_account_id: undefined }) })
    await expect(publishDrop('org-1', 'd1')).rejects.toThrow('Stripe')
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...ORG, public_profile: { enabled: false } }) })
    await expect(publishDrop('org-1', 'd1')).rejects.toThrow('public profile')
    expect(publishDropCoreSpy).not.toHaveBeenCalled()
  })

  it('publishes and sends the announcement batch with drop + unsubscribe links, stamping announced_at', async () => {
    const out = await publishDrop('org-1', 'd1')
    expect(out.status).toBe('scheduled')
    expect(batchSendSpy).toHaveBeenCalledTimes(1)
    const payloads = batchSendSpy.mock.calls[0][0]
    expect(payloads[0].to).toBe('fan@example.com')
    expect(payloads[0].html).toContain('/p/lovebrew/drops/d1')
    expect(payloads[0].html).toContain(`/unsubscribe/${'U'.repeat(48)}`)
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ announced_at: expect.any(String) }))
  })

  it('skips the announcement when email is not a selected channel', async () => {
    publishDropCoreSpy.mockResolvedValue({ ...DROP, channels: [] })
    await publishDrop('org-1', 'd1')
    expect(batchSendSpy).not.toHaveBeenCalled()
    expect(dropUpdateSpy).not.toHaveBeenCalled()
  })

  it('announcement failure does not fail the publish', async () => {
    batchSendSpy.mockRejectedValue(new Error('resend down'))
    const out = await publishDrop('org-1', 'd1')
    expect(out.status).toBe('scheduled')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/actions/drops.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `publishDrop` is not exported.

- [ ] **Step 3: Implement** — add to `actions/drops.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { dropsRef, publishDropCore } from '@/lib/storefront/drops'   // merge into the existing import
import { customersRef } from '@/lib/crm/customers'
import { buildDropAnnouncementEmail } from '@/lib/email'
import { getResend } from '@/lib/resend'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Customer, Org } from '@/lib/types'

const APP_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'

/**
 * Publish = the moment the announcement goes out (spec §6: no scheduled-send
 * infrastructure in v1 — the operator controls timing by choosing when to
 * publish). Gates live here, not in the core: the public URL needs the org's
 * handle, and checkout needs Stripe.
 */
export async function publishDrop(orgId: string, dropId: string): Promise<Drop> {
  await assertOrgAdmin(orgId)
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.exists ? (orgSnap.data() as Org) : null
  if (!org?.stripe_account_id) throw new Error('Connect Stripe before publishing a drop (Settings → Billing)')
  const handle = org.public_profile?.enabled === true ? org.public_profile.handle : undefined
  if (!handle) throw new Error('Enable your public profile before publishing a drop (Settings → Public profile)')

  const drop = await publishDropCore(orgId, dropId)

  if (drop.channels.includes('email') && !drop.announced_at) {
    try {
      const snap = await customersRef(orgId).where('marketing.subscribed', '==', true).get()
      const subscribers = snap.docs
        .map((d) => d.data() as Customer)
        .filter((c) => c.email && c.marketing?.unsubscribe_token)
      if (subscribers.length > 0) {
        let fromDomain: string | undefined
        try {
          fromDomain = await getVerifiedSendingDomain(orgId)
        } catch {
          // fall back to the platform default sender
        }
        const displayName = org.branding?.display_name || org.name
        const opensLabel = new Intl.DateTimeFormat('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          timeZone: drop.timezone,
        }).format(new Date(drop.opens_at))
        const payloads = subscribers.map((c) =>
          buildDropAnnouncementEmail({
            to: c.email!,
            orgDisplayName: displayName,
            dropTitle: drop.title,
            opensLabel,
            dropUrl: `${APP_ORIGIN}/p/${handle}/drops/${drop.id}`,
            unsubscribeUrl: `${APP_ORIGIN}/unsubscribe/${c.marketing!.unsubscribe_token}`,
            ...(fromDomain ? { fromDomain } : {}),
          }),
        )
        const resend = getResend()
        for (let i = 0; i < payloads.length; i += 100) {
          await resend.batch.send(payloads.slice(i, i + 100))
        }
      }
      await dropsRef(orgId).doc(dropId).update({ announced_at: new Date().toISOString() })
    } catch (err) {
      console.error('drop announcement failed', err)
      // best-effort: the publish itself stands
    }
  }
  return drop
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/actions/drops.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/drops.ts __tests__/actions/drops.test.ts
git commit -m "feat(drops): publishDrop — stripe/handle gates + subscriber announcement batch"
```

---

### Task 11: Public drop page — menu, cart, Stripe checkout

**Files:**
- Create: `app/(public)/p/[handle]/drops/[dropId]/page.tsx`, `components/storefront/DropStorefront.tsx`, `components/storefront/DropCheckout.tsx`
- Test: `__tests__/components/storefront/DropStorefront.test.tsx`

**Interfaces:**
- Consumes: `getPublicDrop`, `PublicDrop` shape (Task 7); intent route contract (Task 8: POST body / `{ clientSecret, stripeAccountId, orderToken }`); `readableTextOn` from `@/lib/branding`; `Button` from `@/components/ui/button`; `loadStripe` + Elements exactly as `ProposalDepositPayment.tsx`.
- Produces: the shareable public URL `/p/[handle]/drops/[dropId]`. On payment success the buyer is sent to `/orders/[orderToken]` (Task 12).

- [ ] **Step 1: Write the failing tests** — `__tests__/components/storefront/DropStorefront.test.tsx` (RTL; the checkout child is not exercised here — Stripe Elements is mocked out at the module boundary):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/storefront/DropCheckout', () => ({
  DropCheckout: () => <div data-testid="checkout" />,
}))

import { DropStorefront } from '@/components/storefront/DropStorefront'

const DROP = {
  id: 'd1', title: 'Weekend Drop', note: 'Thanks for the love!', phase: 'open' as const,
  opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [
    { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, sold_out: false },
    { product_id: 'p2', name: 'Cinnamon Roll', price: 5.5, sold_out: true },
  ],
  tips_enabled: false,
  org: { display_name: 'Love Brew', handle: 'lovebrew' },
}

describe('DropStorefront', () => {
  it('renders menu, disables sold-out items, and builds a cart with a running total', () => {
    render(<DropStorefront drop={DROP} />)
    expect(screen.getByText('Weekend Drop')).toBeInTheDocument()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    expect(screen.getByText('$11.00')).toBeInTheDocument()
    // sold-out item has no add button
    expect(screen.queryByRole('button', { name: /add cinnamon roll/i })).not.toBeInTheDocument()
  })

  it('shows the ended banner instead of a cart when the phase is ended', () => {
    render(<DropStorefront drop={{ ...DROP, phase: 'ended' }} />)
    expect(screen.getByText(/sales have ended/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add vanilla latte/i })).not.toBeInTheDocument()
  })

  it('shows opens-at info when upcoming', () => {
    render(<DropStorefront drop={{ ...DROP, phase: 'upcoming' }} />)
    expect(screen.getByText(/orders open/i)).toBeInTheDocument()
  })

  it('advances to checkout once the cart has items and pickup is chosen', () => {
    render(<DropStorefront drop={DROP} />)
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    fireEvent.click(screen.getByRole('button', { name: /check out/i }))
    expect(screen.getByTestId('checkout')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/storefront/DropStorefront.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement.** `app/(public)/p/[handle]/drops/[dropId]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicDrop } from '@/actions/storefront-public'
import { DropStorefront } from '@/components/storefront/DropStorefront'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; dropId: string }>
}): Promise<Metadata> {
  const { handle, dropId } = await params
  const drop = await getPublicDrop(handle, dropId)
  if (!drop) return {}
  const title = `${drop.title} — ${drop.org.display_name}`
  return {
    title,
    ...(drop.note ? { description: drop.note } : {}),
    openGraph: {
      title,
      ...(drop.note ? { description: drop.note } : {}),
      ...(drop.items.find((i) => i.photo_url) ? { images: [drop.items.find((i) => i.photo_url)!.photo_url!] } : {}),
    },
  }
}

export default async function PublicDropPage({
  params,
}: {
  params: Promise<{ handle: string; dropId: string }>
}) {
  const { handle, dropId } = await params
  const drop = await getPublicDrop(handle, dropId)
  if (!drop) notFound()
  return <DropStorefront drop={drop} />
}
```

`components/storefront/DropCheckout.tsx` (the `ProposalDepositPayment` pattern, retargeted):

```tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

export interface CheckoutRequest {
  handle: string
  drop_id: string
  cart: Array<{ product_id: string; qty: number }>
  buyer: { name: string; email: string; phone?: string }
  pickup_window_id: string
  pickup_slot?: string
  tip?: number
}

function PayForm({ total, onPaid }: { total: number; onPaid: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) {
      setError(result.error.message ?? 'Payment failed')
      setSubmitting(false)
    } else {
      onPaid()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <Button type="submit" disabled={submitting || !stripe} className="w-full">
        {submitting ? 'Processing…' : `Pay $${total.toFixed(2)}`}
      </Button>
    </form>
  )
}

export function DropCheckout({ request, total }: { request: CheckoutRequest; total: number }) {
  const [intent, setIntent] = useState<{
    clientSecret?: string
    stripeAccountId?: string
    orderToken?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/payments/drop-order/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIntent(data.error ? { error: data.error } : data)
      })
      .catch(() => {
        if (!cancelled) setIntent({ error: 'Failed to start checkout — please try again' })
      })
    return () => {
      cancelled = true
    }
    // The request is captured once on mount — the parent remounts this
    // component (key) if the cart changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stripePromise = useMemo(
    () =>
      intent?.stripeAccountId
        ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, { stripeAccount: intent.stripeAccountId })
        : null,
    [intent?.stripeAccountId],
  )

  if (intent?.error) {
    return (
      <div aria-live="polite" aria-atomic="true">
        <p className="text-sm text-red-600">{intent.error}</p>
      </div>
    )
  }
  if (!intent?.clientSecret || !stripePromise) {
    return <p className="text-sm text-gray-500">Loading payment form…</p>
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
      <PayForm
        total={total}
        onPaid={() => {
          // Status page owns the post-payment experience (webhook may lag —
          // it renders a "confirming" state while the order is pending).
          window.location.assign(`/orders/${intent.orderToken}`)
        }}
      />
    </Elements>
  )
}
```

`components/storefront/DropStorefront.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { readableTextOn } from '@/lib/branding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropCheckout, type CheckoutRequest } from '@/components/storefront/DropCheckout'
import type { PublicDrop } from '@/actions/storefront-public'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function windowLabel(w: PublicDrop['pickup']['windows'][number]): string {
  return `${w.day} · ${w.start}–${w.end}`
}

function slotOptions(w: PublicDrop['pickup']['windows'][number]): string[] {
  if (!w.slot_minutes) return []
  const out: string[] = []
  const [sh, sm] = w.start.split(':').map(Number)
  const [eh, em] = w.end.split(':').map(Number)
  for (let t = sh * 60 + sm; t < eh * 60 + em; t += w.slot_minutes) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

export function DropStorefront({ drop }: { drop: PublicDrop }) {
  const accent = drop.org.accent_color ?? '#111827'
  const accentText = readableTextOn(accent)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [step, setStep] = useState<'menu' | 'checkout'>('menu')
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [windowId, setWindowId] = useState(drop.pickup.windows[0]?.id ?? '')
  const [slot, setSlot] = useState('')
  const [tip, setTip] = useState(0)

  const itemById = useMemo(() => new Map(drop.items.map((i) => [i.product_id, i])), [drop.items])
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0)
  const subtotal = cartLines.reduce((s, [id, qty]) => s + (itemById.get(id)?.price ?? 0) * qty, 0)
  const tax = drop.tax_rate ? Math.round(subtotal * drop.tax_rate) / 100 : 0
  const total = Math.round((subtotal + tax + tip) * 100) / 100
  const selectedWindow = drop.pickup.windows.find((w) => w.id === windowId)
  const needsSlot = !!selectedWindow?.slot_minutes
  const detailsComplete = buyer.name.trim() !== '' && buyer.email.includes('@') && !!windowId && (!needsSlot || !!slot)

  function add(id: string, delta: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }))
  }

  const request: CheckoutRequest = {
    handle: drop.org.handle,
    drop_id: drop.id,
    cart: cartLines.map(([product_id, qty]) => ({ product_id, qty })),
    buyer: { name: buyer.name.trim(), email: buyer.email.trim(), ...(buyer.phone.trim() ? { phone: buyer.phone.trim() } : {}) },
    pickup_window_id: windowId,
    ...(needsSlot && slot ? { pickup_slot: slot } : {}),
    ...(tip > 0 ? { tip } : {}),
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium" style={{ color: accent }}>{drop.org.display_name}</p>
        <h1 className="text-3xl font-bold">{drop.title}</h1>
        {drop.note && <p className="mt-2 text-sm text-gray-600">{drop.note}</p>}
        <p className="mt-2 text-sm text-gray-500">
          Pickup: {drop.pickup.location_name}
          {drop.pickup.address ? ` — ${drop.pickup.address}` : ''}
        </p>
      </header>

      {drop.phase === 'upcoming' && (
        <div className="rounded-xl border p-4 text-sm">
          Orders open {new Date(drop.opens_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
        </div>
      )}
      {drop.phase === 'ended' && (
        <div className="rounded-xl border p-4 text-sm">Sales have ended for this drop.</div>
      )}

      <main className="mt-6 grid gap-3">
        {drop.items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-3 rounded-2xl border p-3">
            {item.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt="" className="h-16 w-16 flex-none rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-gray-600">{money(item.price)}</p>
              {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
            </div>
            {drop.phase === 'open' && !item.sold_out ? (
              <div className="flex flex-none items-center gap-2">
                {(cart[item.product_id] ?? 0) > 0 && (
                  <>
                    <Button variant="outline" size="sm" aria-label={`Remove ${item.name}`} onClick={() => add(item.product_id, -1)}>−</Button>
                    <span className="w-5 text-center text-sm">{cart[item.product_id]}</span>
                  </>
                )}
                <Button size="sm" aria-label={`Add ${item.name}`} onClick={() => add(item.product_id, 1)}
                  style={{ backgroundColor: accent, color: accentText }}>+</Button>
              </div>
            ) : item.sold_out ? (
              <span className="flex-none rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">Sold out</span>
            ) : null}
          </div>
        ))}
      </main>

      {drop.phase === 'open' && cartLines.length > 0 && (
        <section className="mt-8 rounded-2xl border p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Subtotal</span><span>{money(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Tax</span><span>{money(tax)}</span>
            </div>
          )}
          {drop.tips_enabled && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-gray-600">Tip</span>
              {[0, 0.1, 0.15, 0.2].map((pct) => (
                <button key={pct} type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${tip === Math.round(subtotal * pct * 100) / 100 ? 'border-gray-900 font-semibold' : 'border-gray-300'}`}
                  onClick={() => setTip(Math.round(subtotal * pct * 100) / 100)}>
                  {pct === 0 ? 'None' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between font-semibold">
            <span>Total</span><span>{money(total)}</span>
          </div>

          {step === 'menu' ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="buyer-name">Name</Label>
                <Input id="buyer-name" value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} />
                <Label htmlFor="buyer-email">Email</Label>
                <Input id="buyer-email" type="email" value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} />
                <Label htmlFor="buyer-phone">Phone (optional)</Label>
                <Input id="buyer-phone" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} />
                <Label htmlFor="pickup-window">Pickup window</Label>
                <select id="pickup-window" className="rounded-md border px-3 py-2 text-sm"
                  value={windowId} onChange={(e) => { setWindowId(e.target.value); setSlot('') }}>
                  {drop.pickup.windows.map((w) => (
                    <option key={w.id} value={w.id}>{windowLabel(w)}</option>
                  ))}
                </select>
                {needsSlot && selectedWindow && (
                  <>
                    <Label htmlFor="pickup-slot">Pickup time</Label>
                    <select id="pickup-slot" className="rounded-md border px-3 py-2 text-sm"
                      value={slot} onChange={(e) => setSlot(e.target.value)}>
                      <option value="">Choose a time…</option>
                      {slotOptions(selectedWindow).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <Button className="w-full" disabled={!detailsComplete}
                style={{ backgroundColor: accent, color: accentText }}
                onClick={() => setStep('checkout')}>
                Check out
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              {/* key remounts the checkout (fresh intent) if the cart/tip changed */}
              <DropCheckout key={JSON.stringify(request)} request={request} total={total} />
              <button type="button" className="mt-3 text-xs text-gray-500 underline" onClick={() => setStep('menu')}>
                Back to menu
              </button>
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-gray-400">
        <a href={`/p/${drop.org.handle}`} className="hover:text-gray-600">{drop.org.display_name}</a>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/storefront/DropStorefront.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/p/[handle]/drops/[dropId]/page.tsx" components/storefront/DropStorefront.tsx components/storefront/DropCheckout.tsx __tests__/components/storefront/DropStorefront.test.tsx
git commit -m "feat(drops): public drop page — menu, cart, tip, Stripe checkout"
```

---

### Task 12: Order status page + unsubscribe page

**Files:**
- Create: `app/(public)/orders/[token]/page.tsx`, `app/(public)/unsubscribe/[token]/page.tsx`
- Test: covered by Task 7's projection tests; this task adds a page-level render check to `__tests__/actions/storefront-public.test.ts` only if projections changed (they should not). Manual check in Task 18.

**Interfaces:**
- Consumes: `getPublicOrder`, `unsubscribeByToken` (Task 7).
- Produces: `/orders/[token]` (buyer status page; handles the webhook-lag `pending` state) and `/unsubscribe/[token]` (one-click, uniform response). Routing safety was pre-verified: static first segments win over `[orgSlug]` (same as `/invoices/[token]` today), and org-subdomain rewrites make these 404 on subdomains — links are always issued against the root domain, matching every existing token link.

- [ ] **Step 1: Implement** `app/(public)/orders/[token]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicOrder } from '@/actions/storefront-public'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  pending: { title: 'Confirming your payment…', body: 'This usually takes a few seconds. Refresh this page to check again.' },
  confirmed: { title: 'Order confirmed', body: 'Show this page at pickup.' },
  picked_up: { title: 'Picked up', body: 'Enjoy! This order has been handed off.' },
  canceled: { title: 'Order canceled', body: 'This order was canceled.' },
  refunded: { title: 'Order refunded', body: 'This order was canceled and refunded to your card.' },
}

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getPublicOrder(token)
  if (!order) notFound()
  const copy = STATUS_COPY[order.status] ?? STATUS_COPY.confirmed

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{copy.body}</p>

      {order.number !== undefined && (
        <p className="mt-6 text-center text-5xl font-bold">#{order.number}</p>
      )}
      <p className="mt-2 text-center text-sm text-gray-600">
        {order.drop_title} — {order.buyer_name}
      </p>
      <p className="mt-1 text-center text-sm text-gray-600">
        {order.pickup.day} · {order.pickup.slot ?? `${order.pickup.start}–${order.pickup.end}`} · {order.pickup.location_name}
      </p>

      <div className="mt-8 rounded-2xl border p-4">
        {order.lines.map((l) => (
          <div key={l.product_id} className="flex items-center justify-between py-1 text-sm">
            <span>{l.qty} × {l.name}</span>
            <span>{money(l.price * l.qty)}</span>
          </div>
        ))}
        <div className="mt-2 border-t pt-2 text-sm text-gray-600">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          {order.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{money(order.tax)}</span></div>}
          {order.tip !== undefined && <div className="flex justify-between"><span>Tip</span><span>{money(order.tip)}</span></div>}
          <div className="mt-1 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{money(order.total)}</span></div>
        </div>
      </div>
    </div>
  )
}
```

And `app/(public)/unsubscribe/[token]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { unsubscribeByToken } from '@/actions/storefront-public'

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { ok } = await unsubscribeByToken(token)
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">{ok ? "You're unsubscribed" : 'Link not recognized'}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {ok
          ? "You won't get drop reminders from this shop anymore."
          : 'This unsubscribe link is invalid or was already used.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify build-level correctness**

Run: `npx next build`
Expected: build succeeds (this catches Promise-params typing and any `'use server'` misuse; there are no interactive elements to unit-test here).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/orders/[token]/page.tsx" "app/(public)/unsubscribe/[token]/page.tsx"
git commit -m "feat(drops): public order status + unsubscribe pages"
```

---

### Task 13: Public profile — next-drop card + subscribe form

**Files:**
- Create: `components/storefront/SubscribeCard.tsx`
- Modify: `app/(public)/p/[handle]/page.tsx`
- Test: `__tests__/components/storefront/SubscribeCard.test.tsx`

**Interfaces:**
- Consumes: `subscribeToDrops` (Task 7); `listDropsCore` + `dropPhase` (Tasks 4, 2); `storefrontLabel`/module check via `resolveEnabledModules` from `@/lib/industry-packs`.
- Produces: on `/p/[handle]`, for orgs whose pack enables `'storefront'`: a "Next drop" card (when a scheduled drop is upcoming/open) linking to the drop page, and the `SubscribeCard` (always, so the list grows between drops). `SubscribeCard` props: `{ handle: string }` — it mounts a timestamp for the 3s gate and carries the honeypot field, mirroring `IntakeForm`.

- [ ] **Step 1: Write the failing tests** — `__tests__/components/storefront/SubscribeCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const subscribeSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('@/actions/storefront-public', () => ({ subscribeToDrops: subscribeSpy }))

import { SubscribeCard } from '@/components/storefront/SubscribeCard'

describe('SubscribeCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits handle + email + elapsed time and shows the success state', async () => {
    render(<SubscribeCard handle="lovebrew" />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /don't miss the next one/i }))
    await waitFor(() => expect(screen.getByText(/you're on the list/i)).toBeInTheDocument())
    const [handle, input, elapsed] = subscribeSpy.mock.calls[0]
    expect(handle).toBe('lovebrew')
    expect(input.email).toBe('fan@example.com')
    expect(typeof elapsed).toBe('number')
  })

  it('renders a hidden website honeypot field', () => {
    const { container } = render(<SubscribeCard handle="lovebrew" />)
    expect(container.querySelector('input[name="website"]')).toBeInTheDocument()
  })

  it('surfaces server errors', async () => {
    subscribeSpy.mockRejectedValue(new Error('Too many requests — please try again later.'))
    render(<SubscribeCard handle="lovebrew" />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /don't miss the next one/i }))
    await waitFor(() => expect(screen.getByText(/too many requests/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/storefront/SubscribeCard.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement** `components/storefront/SubscribeCard.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { subscribeToDrops } from '@/actions/storefront-public'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SubscribeCard({ handle }: { handle: string }) {
  const mountedAt = useRef(Date.now())
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')   // honeypot — humans never see it
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('saving')
    setError(null)
    try {
      await subscribeToDrops(
        handle,
        { email, ...(name.trim() ? { name } : {}), ...(website ? { website } : {}) },
        Date.now() - mountedAt.current,
      )
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border p-4 text-center">
        <p className="font-semibold">You&apos;re on the list 🎉</p>
        <p className="mt-1 text-sm text-gray-600">We&apos;ll email you when the next drop is scheduled.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border p-4">
      <p className="font-semibold">Don&apos;t miss the next drop</p>
      <div className="mt-3 grid gap-2">
        <Label htmlFor="subscribe-name">Name (optional)</Label>
        <Input id="subscribe-name" value={name} onChange={(e) => setName(e.target.value)} />
        <Label htmlFor="subscribe-email">Email</Label>
        <Input id="subscribe-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        />
      </div>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <Button type="submit" disabled={state === 'saving'} className="mt-3 w-full">
        {state === 'saving' ? 'Saving…' : "Don't miss the next one"}
      </Button>
    </form>
  )
}
```

Then modify `app/(public)/p/[handle]/page.tsx`: after the existing `main` links block, add (server-side):

```tsx
// new imports at top:
import { listDropsCore } from '@/lib/storefront/drops'
import { dropPhase } from '@/lib/storefront/drop-logic'
import { resolveEnabledModules } from '@/lib/industry-packs'
import { SubscribeCard } from '@/components/storefront/SubscribeCard'
```

```tsx
// inside PublicProfilePage, after `const socials = …`:
  const storefrontOn = resolveEnabledModules(org.industry_pack_id).includes('storefront')
  let nextDrop: { id: string; title: string; phase: string; opens_at: string } | null = null
  if (storefrontOn) {
    const now = new Date().toISOString()
    const candidates = (await listDropsCore(org.id))
      .filter((d) => d.status === 'scheduled')
      .map((d) => ({ d, phase: dropPhase(d, now) }))
      .filter(({ phase }) => phase === 'open' || phase === 'upcoming')
      .sort((a, b) => a.d.opens_at.localeCompare(b.d.opens_at))
    const hit = candidates.find(({ phase }) => phase === 'open') ?? candidates[0]
    if (hit) nextDrop = { id: hit.d.id, title: hit.d.title, phase: hit.phase, opens_at: hit.d.opens_at }
  }
```

```tsx
// in the JSX, between <main> (links) and <footer>:
      {storefrontOn && (
        <section className="mt-8 flex flex-col gap-3">
          {nextDrop && (
            <a
              href={`/p/${handle}/drops/${nextDrop.id}`}
              className="rounded-2xl border px-4 py-3 text-center font-semibold"
              style={{ backgroundColor: accent, borderColor: accent, color: accentText }}
            >
              {nextDrop.phase === 'open' ? `Order now — ${nextDrop.title}` : `Next drop: ${nextDrop.title}`}
            </a>
          )}
          <SubscribeCard handle={handle} />
        </section>
      )}
```

(The page already computes `accent`/`accentText`; `handle` is already awaited from params.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/storefront/SubscribeCard.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/storefront/SubscribeCard.tsx "app/(public)/p/[handle]/page.tsx" __tests__/components/storefront/SubscribeCard.test.tsx
git commit -m "feat(drops): public profile next-drop card + subscriber capture"
```

---

### Task 14: Admin — Drops/Products tabs + sidebar entry

**Files:**
- Create: `app/(admin)/[orgSlug]/drops/page.tsx`, `components/admin/storefront/StorefrontClient.tsx`, `components/admin/storefront/DropsTab.tsx`, `components/admin/storefront/ProductsTab.tsx`
- Modify: `components/layout/AdminSidebar.tsx` (`ORG_PAGE_SLUGS` + `opsLinks`)
- Test: `__tests__/components/admin/storefront/ProductsTab.test.tsx`, `__tests__/components/admin/storefront/DropsTab.test.tsx`, extend `__tests__/components/layout/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: actions from Tasks 3–4 (`listProducts`, `createProduct`, `updateProduct`, `uploadProductPhoto`, `listDrops`); `storefrontLabel`, `getIndustryPack`, `resolveEnabledModules`; `dropPhase`; `requireOrgMember` from `@/lib/auth/guards`; UI primitives `Card/Button/Input/Label` from `@/components/ui/*` (PackagesTab pattern: client component + optimistic `useState` + direct server-action calls).
- Produces: `/{orgSlug}/drops` — tabbed screen (Drops | Products), sidebar-visible. `StorefrontClient` props: `{ orgId: string; orgSlug: string; isAdmin: boolean; title: string; drops: Drop[]; products: Product[] }`. `DropsTab` links each drop to `/{orgSlug}/drops/{id}` (editor, Task 15) and `/{orgSlug}/drop-orders/{id}` (board, Task 16), plus a "New drop" link to `/{orgSlug}/drops/new`.

- [ ] **Step 1: Write the failing tests.**

`__tests__/components/admin/storefront/ProductsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createProductSpy = vi.hoisted(() => vi.fn())
const updateProductSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const uploadPhotoSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ url: 'https://x/p.jpg' }))
vi.mock('@/actions/products', () => ({
  createProduct: createProductSpy, updateProduct: updateProductSpy, uploadProductPhoto: uploadPhotoSpy,
}))

import { ProductsTab } from '@/components/admin/storefront/ProductsTab'

const PRODUCTS = [
  { id: 'p1', name: 'Vanilla Latte', price: 5.5, active: true, created_at: 'x' },
  { id: 'p2', name: 'Old Special', price: 4, active: false, created_at: 'x' },
]

describe('ProductsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists active products and marks archived ones', () => {
    render(<ProductsTab orgId="org-1" isAdmin products={PRODUCTS} />)
    expect(screen.getByText('Vanilla Latte')).toBeInTheDocument()
    expect(screen.getByText(/archived/i)).toBeInTheDocument()
  })

  it('creates a product from the form and shows it optimistically', async () => {
    createProductSpy.mockResolvedValue({ id: 'p3', name: 'Cold Brew', price: 4.5, active: true, created_at: 'x' })
    render(<ProductsTab orgId="org-1" isAdmin products={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /new product/i }))
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Cold Brew' } })
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '4.5' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText('Cold Brew')).toBeInTheDocument())
    expect(createProductSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ name: 'Cold Brew', price: 4.5 }))
  })

  it('hides mutation controls for non-admins', () => {
    render(<ProductsTab orgId="org-1" isAdmin={false} products={PRODUCTS} />)
    expect(screen.queryByRole('button', { name: /new product/i })).not.toBeInTheDocument()
  })
})
```

`__tests__/components/admin/storefront/DropsTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { DropsTab } from '@/components/admin/storefront/DropsTab'

const DROPS = [
  { id: 'd1', title: 'Weekend Drop', status: 'scheduled' as const, opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z', timezone: 'UTC', pickup: { location_name: 'SW Boise', windows: [] }, items: [], channels: [], created_at: 'x' },
  { id: 'd2', title: 'Draft Drop', status: 'draft' as const, opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', timezone: 'UTC', pickup: { location_name: 'x', windows: [] }, items: [], channels: [], created_at: 'x' },
]

describe('DropsTab', () => {
  it('shows phase badges, per-drop stats, and links to editor, board, and new-drop', () => {
    render(<DropsTab orgSlug="acme" drops={DROPS} stats={{ d1: { count: 12, revenue: 66 } }} isAdmin />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText(/12 orders/)).toBeInTheDocument()
    expect(screen.getByText(/\$66\.00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /new drop/i })).toHaveAttribute('href', '/acme/drops/new')
    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('href', '/acme/drop-orders/d1')
  })
})
```

Extend `__tests__/components/layout/AdminSidebar.test.tsx` with one case (follow that file's existing render helpers/mocks):

```tsx
  it('shows the storefront link with the pack label when the module is enabled', () => {
    renderSidebar({ enabledModules: ['storefront'], catalogLabel: 'Menu Packages', storefrontLabel: 'Drops' })
    expect(screen.getByText('Drops')).toBeInTheDocument()
  })
```

(Adapt to the file's actual helper signature — `AdminSidebar` gains a `storefrontLabel?: string` prop in this task, defaulting to `'Online orders'`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/admin/storefront __tests__/components/layout/AdminSidebar.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — components/prop do not exist.

- [ ] **Step 3: Implement.**

`components/layout/AdminSidebar.tsx` — three minimal edits (keep tiny; `feat/invoice-redesign` also touches this file):
1. Props: add `storefrontLabel?: string`.
2. `ORG_PAGE_SLUGS`: add `'drops'` (NOT `'drop-orders'` — the board deliberately renders shell-free, Task 16).
3. `opsLinks`: after the catalog entry, add
   `...(has('storefront' as ModuleId) ? [{ slug: 'drops', label: storefrontLabel ?? 'Online orders', icon: 'packages' as NavIconName }] : []),`

`app/(admin)/[orgSlug]/layout.tsx` — pass the label: `storefrontLabel={storefrontLabel(getIndustryPack(org.industry_pack_id))}` (import `storefrontLabel` alongside the existing `catalogLabel` import).

`app/(admin)/[orgSlug]/drops/page.tsx` (packages/page.tsx pattern):

```tsx
export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listDrops } from '@/actions/drops'
import { listOrdersForDropCore } from '@/lib/storefront/orders'
import { listProducts } from '@/actions/products'
import { getIndustryPack, storefrontLabel } from '@/lib/industry-packs'
import { StorefrontClient } from '@/components/admin/storefront/StorefrontClient'

export default async function DropsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const [drops, products] = await Promise.all([listDrops(orgId), listProducts(orgId)])
  // Per-drop order counts + revenue for the list cards (spec §6 screen 1).
  // Guard-free core is fine here: requireOrgMember already gated the page
  // (house precedent: packages/page.tsx calls listChecklistTemplatesCore).
  const orderSets = await Promise.all(drops.map((d) => listOrdersForDropCore(orgId, d.id)))
  const stats: Record<string, { count: number; revenue: number }> = {}
  drops.forEach((d, i) => {
    const live = orderSets[i].filter((o) => o.status === 'confirmed' || o.status === 'picked_up')
    stats[d.id] = { count: live.length, revenue: live.reduce((s, o) => s + o.total, 0) }
  })
  return (
    <StorefrontClient
      orgId={orgId}
      orgSlug={orgSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      title={storefrontLabel(getIndustryPack(org.industry_pack_id))}
      drops={drops}
      stats={stats}
      products={products}
    />
  )
}
```

`components/admin/storefront/StorefrontClient.tsx` (CatalogClient tab pattern):

```tsx
'use client'

import { useState } from 'react'
import { DropsTab } from '@/components/admin/storefront/DropsTab'
import { ProductsTab } from '@/components/admin/storefront/ProductsTab'
import type { Drop, Product } from '@/lib/types'

type Tab = 'drops' | 'products'

export interface DropStats { count: number; revenue: number }

interface StorefrontClientProps {
  orgId: string
  orgSlug: string
  isAdmin: boolean
  title: string
  drops: Drop[]
  stats: Record<string, DropStats>
  products: Product[]
}

export function StorefrontClient({ orgId, orgSlug, isAdmin, title, drops, stats, products }: StorefrontClientProps) {
  const [tab, setTab] = useState<Tab>('drops')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'drops', label: title },
    { id: 'products', label: 'Products' },
  ]
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <div className="flex gap-1 border-b mb-6" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'drops' && <DropsTab orgSlug={orgSlug} drops={drops} stats={stats} isAdmin={isAdmin} />}
      {tab === 'products' && <ProductsTab orgId={orgId} products={products} isAdmin={isAdmin} />}
    </div>
  )
}
```

`components/admin/storefront/DropsTab.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { dropPhase } from '@/lib/storefront/drop-logic'
import type { Drop, DropPhase } from '@/lib/types'

const PHASE_LABEL: Record<DropPhase, string> = {
  draft: 'Draft', upcoming: 'Scheduled', open: 'Open', ended: 'Ended', archived: 'Archived',
}
const PHASE_STYLE: Record<DropPhase, string> = {
  draft: 'bg-gray-100 text-gray-600',
  upcoming: 'bg-amber-100 text-amber-800',
  open: 'bg-emerald-100 text-emerald-800',
  ended: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
}

export function DropsTab({ orgSlug, drops, stats, isAdmin }: {
  orgSlug: string
  drops: Drop[]
  stats?: Record<string, { count: number; revenue: number }>
  isAdmin: boolean
}) {
  const now = new Date().toISOString()
  const visible = drops.filter((d) => d.status !== 'archived')
  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          <Link
            href={`/${orgSlug}/drops/new`}
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            New drop
          </Link>
        </div>
      )}
      {visible.length === 0 && (
        <p className="text-sm text-gray-500">
          No drops yet. Create products, then schedule your first drop — subscribers get an email when you publish.
        </p>
      )}
      <div className="grid gap-3">
        {visible.map((d) => {
          const phase = dropPhase(d, now)
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{d.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_STYLE[phase]}`}>
                    {PHASE_LABEL[phase]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  {d.items.length} items · pickup {d.pickup.location_name}
                  {stats?.[d.id] ? ` · ${stats[d.id].count} orders · $${stats[d.id].revenue.toFixed(2)}` : ''}
                </p>
              </div>
              <div className="flex flex-none gap-2 text-sm">
                <Link href={`/${orgSlug}/drop-orders/${d.id}`} className="rounded-md border px-3 py-1.5 font-medium">
                  Orders
                </Link>
                <Link href={`/${orgSlug}/drops/${d.id}`} className="rounded-md border px-3 py-1.5 font-medium">
                  {d.status === 'draft' ? 'Edit' : 'Manage'}
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

`components/admin/storefront/ProductsTab.tsx` (PackagesTab draft-dialog pattern, condensed):

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduct, updateProduct, uploadProductPhoto } from '@/actions/products'
import type { Product } from '@/lib/types'

interface Draft { id?: string; name: string; price: string; description: string; photo_url?: string }
const EMPTY: Draft = { name: '', price: '', description: '' }

export function ProductsTab({ orgId, products: initial, isAdmin }: { orgId: string; products: Product[]; isAdmin: boolean }) {
  const [products, setProducts] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePhoto(file: File | undefined) {
    if (!file || !draft) return
    const fd = new FormData()
    fd.set('file', file)
    try {
      const { url } = await uploadProductPhoto(orgId, fd)
      setDraft((d) => d && { ...d, photo_url: url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleSave() {
    if (!draft || !draft.name.trim() || !(Number(draft.price) > 0)) return
    setSaving(true)
    setError(null)
    try {
      if (draft.id) {
        const updates = {
          name: draft.name.trim(),
          price: Number(draft.price),
          description: draft.description.trim() ? draft.description.trim() : null,
          photo_url: draft.photo_url ?? null,
        }
        await updateProduct(orgId, draft.id, updates)
        setProducts((prev) => prev.map((p) => (p.id === draft.id
          ? { ...p, name: updates.name, price: updates.price,
              ...(updates.description ? { description: updates.description } : { description: undefined }),
              ...(updates.photo_url ? { photo_url: updates.photo_url } : { photo_url: undefined }) }
          : p)))
      } else {
        const created = await createProduct(orgId, {
          name: draft.name.trim(),
          price: Number(draft.price),
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
          ...(draft.photo_url ? { photo_url: draft.photo_url } : {}),
        })
        setProducts((prev) => [...prev, created])
      }
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    await updateProduct(orgId, p.id, { active: !p.active })
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)))
  }

  return (
    <div>
      {isAdmin && !draft && (
        <Button className="mb-4" onClick={() => setDraft(EMPTY)}>New product</Button>
      )}
      {draft && (
        <div className="mb-6 grid max-w-md gap-2 rounded-xl border bg-white p-4">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" value={draft.name} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
          <Label htmlFor="product-price">Price</Label>
          <Input id="product-price" type="number" step="0.25" min="0" value={draft.price}
            onChange={(e) => setDraft((d) => d && { ...d, price: e.target.value })} />
          <Label htmlFor="product-description">Description</Label>
          <Input id="product-description" value={draft.description}
            onChange={(e) => setDraft((d) => d && { ...d, description: e.target.value })} />
          <Label htmlFor="product-photo">Photo</Label>
          <input id="product-photo" type="file" accept="image/*" className="text-sm"
            onChange={(e) => handlePhoto(e.target.files?.[0])} />
          {draft.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photo_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button onClick={handleSave} disabled={saving}>Save</Button>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-white p-3 ${p.active ? '' : 'opacity-60'}`}>
            {p.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo_url} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
            )}
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-gray-600">${p.price.toFixed(2)}</p>
            {!p.active && <p className="text-xs text-gray-400">Archived</p>}
            {isAdmin && (
              <div className="mt-2 flex gap-2 text-xs">
                <button className="underline" onClick={() => setDraft({ id: p.id, name: p.name, price: String(p.price), description: p.description ?? '', photo_url: p.photo_url })}>
                  Edit
                </button>
                <button className="underline" onClick={() => toggleActive(p)}>
                  {p.active ? 'Archive' : 'Restore'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/admin/storefront __tests__/components/layout/AdminSidebar.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/drops/page.tsx" "app/(admin)/[orgSlug]/layout.tsx" components/admin/storefront/StorefrontClient.tsx components/admin/storefront/DropsTab.tsx components/admin/storefront/ProductsTab.tsx components/layout/AdminSidebar.tsx __tests__/components/admin/storefront __tests__/components/layout/AdminSidebar.test.tsx
git commit -m "feat(drops): admin storefront — drops list + products tabs, sidebar entry"
```

---

### Task 15: Admin — drop editor + share kit

**Files:**
- Create: `app/(admin)/[orgSlug]/drops/new/page.tsx`, `app/(admin)/[orgSlug]/drops/[dropId]/page.tsx`, `components/admin/storefront/DropEditorClient.tsx`
- Test: none beyond Task 4's action tests (the editor is a thin form over `createDrop`/`updateDraftDrop`/`publishDrop`/`closeDrop`/`adjustDropStock`); `npx next build` is the gate. Manual walk in Task 18.

**Interfaces:**
- Consumes: Tasks 4 + 10 actions; `listProducts`; `getOrgBySlug` is NOT needed — pages use `requireOrgMember`. Org gating facts needed by the editor UI (`orgHasStripe`, `handle`) are computed in the server page from `org`.
- Produces: `/{orgSlug}/drops/new` (create) and `/{orgSlug}/drops/{dropId}` (draft: full edit + publish; published: share kit, close, stock adjustments). Datetime handling: `<input type="datetime-local">` values are converted with `new Date(value).toISOString()` and the browser IANA zone is captured via `Intl.DateTimeFormat().resolvedOptions().timeZone` into `timezone` (spec §3.2).

- [ ] **Step 1: Implement the server pages.**

`app/(admin)/[orgSlug]/drops/new/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listProducts } from '@/actions/products'
import { DropEditorClient } from '@/components/admin/storefront/DropEditorClient'

export default async function NewDropPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const products = await listProducts(orgId)
  return (
    <DropEditorClient
      orgId={orgId}
      orgSlug={orgSlug}
      products={products}
      drop={null}
      orgHasStripe={!!org.stripe_account_id}
      handle={org.public_profile?.enabled === true ? org.public_profile.handle : undefined}
      tipsEnabled={org.tips_enabled ?? false}
    />
  )
}
```

`app/(admin)/[orgSlug]/drops/[dropId]/page.tsx` — identical shape plus:

```tsx
import { notFound } from 'next/navigation'
import { getDrop } from '@/actions/drops'
// params: Promise<{ orgSlug: string; dropId: string }>
const drop = await getDrop(orgId, dropId)
if (!drop) notFound()
// pass drop={drop} to DropEditorClient
```

- [ ] **Step 2: Implement** `components/admin/storefront/DropEditorClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createDrop, updateDraftDrop, publishDrop, closeDrop, adjustDropStock } from '@/actions/drops'
import type { CreateDropInput } from '@/lib/storefront/drops'
import type { Drop, DropChannel, Product } from '@/lib/types'

const CHANNELS: Array<{ id: DropChannel; label: string; live: boolean }> = [
  { id: 'email', label: 'Email subscribers', live: true },
  { id: 'sms', label: 'SMS (coming soon)', live: false },
  { id: 'instagram', label: 'Instagram (share kit)', live: false },
  { id: 'facebook', label: 'Facebook (share kit)', live: false },
  { id: 'tiktok', label: 'TikTok (share kit)', live: false },
]

interface WindowDraft { day: string; start: string; end: string; slot_minutes: string }
interface ItemDraft { product_id: string; stock: string }

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DropEditorClient({
  orgId, orgSlug, products, drop, orgHasStripe, handle, tipsEnabled,
}: {
  orgId: string
  orgSlug: string
  products: Product[]
  drop: Drop | null
  orgHasStripe: boolean
  handle?: string
  tipsEnabled: boolean
}) {
  const router = useRouter()
  const isDraft = !drop || drop.status === 'draft'
  const [title, setTitle] = useState(drop?.title ?? '')
  const [note, setNote] = useState(drop?.note ?? '')
  const [opensAt, setOpensAt] = useState(drop ? toLocalInput(drop.opens_at) : '')
  const [closesAt, setClosesAt] = useState(drop ? toLocalInput(drop.closes_at) : '')
  const [location, setLocation] = useState(drop?.pickup.location_name ?? '')
  const [address, setAddress] = useState(drop?.pickup.address ?? '')
  const [windows, setWindows] = useState<WindowDraft[]>(
    drop?.pickup.windows.map((w) => ({ day: w.day, start: w.start, end: w.end, slot_minutes: w.slot_minutes ? String(w.slot_minutes) : '' })) ??
    [{ day: '', start: '08:00', end: '11:00', slot_minutes: '' }],
  )
  const [items, setItems] = useState<ItemDraft[]>(
    drop?.items.map((i) => ({ product_id: i.product_id, stock: i.stock !== undefined ? String(i.stock) : '' })) ?? [],
  )
  const [taxRate, setTaxRate] = useState(drop?.tax_rate !== undefined ? String(drop.tax_rate) : '')
  const [channels, setChannels] = useState<DropChannel[]>(drop?.channels ?? ['email'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeProducts = products.filter((p) => p.active)
  const publicUrl = handle && drop ? `${window.location.origin}/p/${handle}/drops/${drop.id}` : null
  const shareText = drop
    ? `${title} — orders open soon! ☕ Order ahead: ${publicUrl ?? ''}`
    : ''

  function buildInput(): CreateDropInput {
    return {
      title,
      ...(note.trim() ? { note } : {}),
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pickup: {
        location_name: location,
        ...(address.trim() ? { address } : {}),
        windows: windows.map((w) => ({
          day: w.day, start: w.start, end: w.end,
          ...(w.slot_minutes !== '' ? { slot_minutes: Number(w.slot_minutes) } : {}),
        })),
      },
      items: items.map((i) => ({
        product_id: i.product_id,
        ...(i.stock !== '' ? { stock: Number(i.stock) } : {}),
      })),
      ...(taxRate !== '' ? { tax_rate: Number(taxRate) } : {}),
      channels,
    }
  }

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      after?.()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    await run(async () => {
      if (drop) await updateDraftDrop(orgId, drop.id, buildInput())
      else {
        const created = await createDrop(orgId, buildInput())
        router.push(`/${orgSlug}/drops/${created.id}`)
      }
    })
  }

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">{drop ? title || 'Drop' : 'New drop'}</h1>
      {!orgHasStripe && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Connect Stripe (Settings → Billing) before this drop can be published.
        </p>
      )}
      {!handle && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Enable your public profile (Settings → Public profile) — the drop page lives under it.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-600" aria-live="polite">{error}</p>}

      {isDraft ? (
        <div className="grid gap-3">
          <Label htmlFor="drop-title">Title</Label>
          <Input id="drop-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label htmlFor="drop-note">Note to customers</Label>
          <Input id="drop-note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="drop-opens">Orders open</Label>
              <Input id="drop-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="drop-closes">Orders close</Label>
              <Input id="drop-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>

          <h2 className="mt-3 font-semibold">Pickup</h2>
          <Label htmlFor="drop-location">Location name</Label>
          <Input id="drop-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Label htmlFor="drop-address">Address (optional)</Label>
          <Input id="drop-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          {windows.map((w, i) => (
            <div key={i} className="grid grid-cols-4 items-end gap-2">
              <div>
                <Label>Day</Label>
                <Input type="date" value={w.day} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
              </div>
              <div>
                <Label>Start</Label>
                <Input type="time" value={w.start} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={w.end} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              </div>
              <div>
                <Label>Slot mins (optional)</Label>
                <Input type="number" min="5" value={w.slot_minutes} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, slot_minutes: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <button type="button" className="w-fit text-sm underline" onClick={() => setWindows((ws) => [...ws, { day: '', start: '08:00', end: '11:00', slot_minutes: '' }])}>
            + Add pickup window
          </button>

          <h2 className="mt-3 font-semibold">Menu</h2>
          {activeProducts.length === 0 && (
            <p className="text-sm text-gray-500">No active products yet — add some on the Products tab first.</p>
          )}
          {activeProducts.map((p) => {
            const sel = items.find((i) => i.product_id === p.id)
            return (
              <div key={p.id} className="flex items-center gap-3">
                <input
                  id={`item-${p.id}`} type="checkbox" checked={!!sel}
                  onChange={(e) =>
                    setItems((prev) => (e.target.checked ? [...prev, { product_id: p.id, stock: '' }] : prev.filter((i) => i.product_id !== p.id)))
                  }
                />
                <label htmlFor={`item-${p.id}`} className="flex-1 text-sm">{p.name} — ${p.price.toFixed(2)}</label>
                {sel && (
                  <Input
                    className="w-28" type="number" min="0" placeholder="Stock (∞)"
                    value={sel.stock}
                    onChange={(e) => setItems((prev) => prev.map((i) => (i.product_id === p.id ? { ...i, stock: e.target.value } : i)))}
                  />
                )}
              </div>
            )
          })}

          <Label htmlFor="drop-tax">Tax rate % (optional{tipsEnabled ? ' · tips are collected at checkout' : ''})</Label>
          <Input id="drop-tax" className="w-28" type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />

          <h2 className="mt-3 font-semibold">Announce on</h2>
          {CHANNELS.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <input
                id={`ch-${c.id}`} type="checkbox" checked={channels.includes(c.id)}
                onChange={(e) => setChannels((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
              />
              <label htmlFor={`ch-${c.id}`} className={c.live ? '' : 'text-gray-500'}>{c.label}</label>
            </div>
          ))}

          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={busy}>{drop ? 'Save draft' : 'Create draft'}</Button>
            {drop && (
              <Button
                disabled={busy || !orgHasStripe || !handle}
                onClick={() => run(() => publishDrop(orgId, drop.id))}
              >
                Publish{channels.includes('email') ? ' & announce' : ''}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-gray-600">
            Published. Items, prices, and windows are locked — you can adjust stock, close sales early, or share the link.
          </p>
          {publicUrl && (
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Share kit</h2>
              <p className="mt-1 break-all text-sm text-gray-600">{publicUrl}</p>
              <p className="mt-2 rounded-md bg-gray-50 p-2 text-sm">{shareText}</p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy link</Button>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(shareText)}>Copy post</Button>
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold">Stock</h2>
            {drop!.items.map((i) => (
              <div key={i.product_id} className="mt-2 flex items-center gap-3 text-sm">
                <span className="flex-1">{i.name}</span>
                <Input
                  className="w-28" type="number" min="0" placeholder="∞"
                  defaultValue={i.stock !== undefined ? String(i.stock) : ''}
                  onBlur={(e) =>
                    run(() => adjustDropStock(orgId, drop!.id, i.product_id, e.target.value === '' ? null : Number(e.target.value)))
                  }
                />
              </div>
            ))}
          </div>
          {drop!.status === 'scheduled' && (
            <Button variant="outline" disabled={busy} onClick={() => run(() => closeDrop(orgId, drop!.id))}>
              Close sales now
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npx next build`
Expected: build succeeds. Also run the full storefront test set as a regression check:
`npx vitest run __tests__/lib/storefront __tests__/actions/drops.test.ts --exclude '**/.claude/**'` — PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/[orgSlug]/drops/new/page.tsx" "app/(admin)/[orgSlug]/drops/[dropId]/page.tsx" components/admin/storefront/DropEditorClient.tsx
git commit -m "feat(drops): drop editor — draft form, publish gates, share kit, stock control"
```

---

### Task 16: Admin — orders board (mobile-first, shell-free) + cancelOrder

**Files:**
- Create: `app/(admin)/[orgSlug]/drop-orders/[dropId]/page.tsx`, `components/admin/storefront/OrdersBoardClient.tsx`, `actions/orders.ts`
- Test: `__tests__/actions/orders.test.ts`, `__tests__/components/admin/storefront/OrdersBoardClient.test.tsx`

**Interfaces:**
- Consumes: `listOrdersForDropCore`, `markPickedUpCore`, `markRefundedCore` (Task 5); `getDropCore`; `stripe`; `assertOrgMember`/`assertOrgAdmin`.
- Produces: `actions/orders.ts` with `listOrdersForDrop(orgId, dropId)`, `markOrderPickedUp(orgId, orderId)`, `cancelOrder(orgId, orderId, opts?: { note?: string })`. Route `/{orgSlug}/drop-orders/{dropId}` — **deliberately NOT added to `ORG_PAGE_SLUGS`**, so `AdminSidebar` returns `null` and the page owns the full viewport (the sidebar's documented self-hide behavior). This satisfies the spec's mobile constraint on main today, independent of the unmerged `feat/invoice-redesign` drawer; the page still sits inside the admin layout's auth gate. It renders mobile-first (single column, large touch targets) with a back link to `/{orgSlug}/drops`.

- [ ] **Step 1: Write the failing tests.**

`__tests__/actions/orders.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listOrdersSpy = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const markPickedUpSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const markRefundedSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const orderGetSpy = vi.hoisted(() => vi.fn())
const orgGetSpy = vi.hoisted(() => vi.fn())
const refundCreateSpy = vi.hoisted(() => vi.fn())
const assertOrgAdminSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'staff' }),
  assertOrgAdmin: assertOrgAdminSpy,
}))
vi.mock('@/lib/storefront/orders', () => ({
  listOrdersForDropCore: listOrdersSpy,
  markPickedUpCore: markPickedUpSpy,
  markRefundedCore: markRefundedSpy,
  ordersRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orderGetSpy }) }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: orgGetSpy }) }) },
}))
vi.mock('@/lib/stripe', () => ({ stripe: { refunds: { create: refundCreateSpy } } }))

import { cancelOrder, markOrderPickedUp } from '@/actions/orders'

describe('cancelOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ stripe_account_id: 'acct_1' }) })
    orderGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'o1', status: 'confirmed', total: 11, payment: { intent_id: 'pi_1', paid_at: 'x' } }),
    })
    refundCreateSpy.mockResolvedValue({ id: 're_1', amount: 1100 })
  })

  it('refunds the full PI on the connected account and marks the order refunded', async () => {
    await cancelOrder('org-1', 'o1', { note: 'ran out' })
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('org-1')
    expect(refundCreateSpy).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { stripeAccount: 'acct_1' })
    expect(markRefundedSpy).toHaveBeenCalledWith('org-1', 'o1', expect.objectContaining({ refund_id: 're_1', amount: 11, note: 'ran out' }))
  })

  it('rejects orders without a payment and refunded orders', async () => {
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'pending' }) })
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('paid')
    orderGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', status: 'refunded', payment: { intent_id: 'pi_1' } }) })
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('already')
    expect(refundCreateSpy).not.toHaveBeenCalled()
  })

  it('does not mark refunded when the Stripe refund fails', async () => {
    refundCreateSpy.mockRejectedValue(new Error('stripe down'))
    await expect(cancelOrder('org-1', 'o1')).rejects.toThrow('stripe down')
    expect(markRefundedSpy).not.toHaveBeenCalled()
  })
})

describe('markOrderPickedUp', () => {
  it('delegates to the core', async () => {
    await markOrderPickedUp('org-1', 'o1')
    expect(markPickedUpSpy).toHaveBeenCalledWith('org-1', 'o1')
  })
})
```

`__tests__/components/admin/storefront/OrdersBoardClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const markPickedUpSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const cancelOrderSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/actions/orders', () => ({ markOrderPickedUp: markPickedUpSpy, cancelOrder: cancelOrderSpy }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { OrdersBoardClient } from '@/components/admin/storefront/OrdersBoardClient'

const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled' as const,
  opens_at: 'x', closes_at: 'x', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [], channels: [], created_at: 'x',
}
const ORDERS = [
  { id: 'o1', org_id: 'org-1', channel: 'drop' as const, drop_id: 'd1', status: 'confirmed' as const, number: 1,
    buyer: { name: 'Jane', email: 'j@x.co' }, lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
    pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 't1', created_at: '2026-08-20T01:00:00Z' },
  { id: 'o2', org_id: 'org-1', channel: 'drop' as const, drop_id: 'd1', status: 'picked_up' as const, number: 2,
    buyer: { name: 'Sam', email: 's@x.co' }, lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 1 }],
    pickup_window_id: 'w1', subtotal: 5.5, tax: 0, total: 5.5, token: 't2', created_at: '2026-08-20T02:00:00Z' },
]

describe('OrdersBoardClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups orders under their pickup window and shows revenue', () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    expect(screen.getByText(/2026-08-22/)).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText(/\$16\.50/)).toBeInTheDocument()   // confirmed+picked_up revenue
  })

  it('marks orders picked up', async () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /picked up/i }))
    await waitFor(() => expect(markPickedUpSpy).toHaveBeenCalledWith('org-1', 'o1'))
  })

  it('prep view aggregates quantities per product', () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    fireEvent.click(screen.getByRole('tab', { name: /prep/i }))
    expect(screen.getByText('3 ×')).toBeInTheDocument()
    expect(screen.getByText('Vanilla Latte')).toBeInTheDocument()
  })

  it('cancel asks for confirmation before refunding', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }))
    await waitFor(() => expect(cancelOrderSpy).toHaveBeenCalledWith('org-1', 'o1'))
    confirmSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/actions/orders.test.ts __tests__/components/admin/storefront/OrdersBoardClient.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement.**

`actions/orders.ts`:

```ts
'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { stripe } from '@/lib/stripe'
import {
  listOrdersForDropCore, markPickedUpCore, markRefundedCore, ordersRef,
} from '@/lib/storefront/orders'
import type { Order, Org } from '@/lib/types'

export async function listOrdersForDrop(orgId: string, dropId: string): Promise<Order[]> {
  await assertOrgMember(orgId)
  return listOrdersForDropCore(orgId, dropId)
}

export async function markOrderPickedUp(orgId: string, orderId: string): Promise<void> {
  await assertOrgMember(orgId)
  return markPickedUpCore(orgId, orderId)
}

/**
 * Full cancel + refund. Writes the refund record immediately from the
 * synchronous Stripe response; the charge.refunded webhook is idempotent
 * backup (and catches dashboard-initiated refunds). Restock is implicit —
 * refunded orders drop out of the availability sum (spec §5.4).
 */
export async function cancelOrder(orgId: string, orderId: string, opts?: { note?: string }): Promise<void> {
  await assertOrgAdmin(orgId)
  const snap = await ordersRef(orgId).doc(orderId).get()
  if (!snap.exists) throw new Error('Order not found')
  const order = snap.data() as Order
  if (order.status === 'refunded') throw new Error('This order was already refunded')
  if (!order.payment?.intent_id) throw new Error('Only paid orders can be canceled — pending holds expire on their own')

  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.exists ? (orgSnap.data() as Org) : null
  if (!org?.stripe_account_id) throw new Error('Stripe is not connected')

  const refund = await stripe.refunds.create(
    { payment_intent: order.payment.intent_id },
    { stripeAccount: org.stripe_account_id },
  )
  await markRefundedCore(orgId, orderId, {
    refund_id: refund.id,
    amount: (refund.amount ?? 0) / 100,
    refunded_at: new Date().toISOString(),
    ...(opts?.note ? { note: opts.note } : {}),
  })
}
```

`app/(admin)/[orgSlug]/drop-orders/[dropId]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getDrop } from '@/actions/drops'
import { listOrdersForDrop } from '@/actions/orders'
import { OrdersBoardClient } from '@/components/admin/storefront/OrdersBoardClient'

export default async function DropOrdersPage({
  params,
}: {
  params: Promise<{ orgSlug: string; dropId: string }>
}) {
  const { orgSlug, dropId } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const drop = await getDrop(orgId, dropId)
  if (!drop) notFound()
  const orders = await listOrdersForDrop(orgId, dropId)
  return (
    <OrdersBoardClient
      orgId={orgId}
      orgSlug={orgSlug}
      drop={drop}
      orders={orders}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
    />
  )
}
```

`components/admin/storefront/OrdersBoardClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { markOrderPickedUp, cancelOrder } from '@/actions/orders'
import type { Drop, Order } from '@/lib/types'

type View = 'orders' | 'prep'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function OrdersBoardClient({
  orgId, orgSlug, drop, orders: initial, isAdmin,
}: {
  orgId: string
  orgSlug: string
  drop: Drop
  orders: Order[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [orders, setOrders] = useState(initial)
  const [view, setView] = useState<View>('orders')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const live = orders.filter((o) => o.status === 'confirmed' || o.status === 'picked_up')
  const revenue = live.reduce((s, o) => s + o.total, 0)
  const prep = new Map<string, { name: string; qty: number }>()
  for (const o of live) {
    for (const l of o.lines) {
      const cur = prep.get(l.product_id)
      prep.set(l.product_id, { name: l.name, qty: (cur?.qty ?? 0) + l.qty })
    }
  }

  async function act(orderId: string, fn: () => Promise<void>, next: Order['status']) {
    setBusyId(orderId)
    setError(null)
    try {
      await fn()
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <Link href={`/${orgSlug}/drops`} className="text-sm text-gray-500">← All drops</Link>
          <h1 className="text-xl font-bold">{drop.title}</h1>
          <p className="text-sm text-gray-500">
            {live.length} orders · {money(revenue)}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>
      </header>

      <div className="mb-4 flex gap-1 border-b" role="tablist">
        {(['orders', 'prep'] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? 'border-gray-900' : 'border-transparent text-gray-500'}`}>
            {v === 'orders' ? 'Orders' : 'Prep'}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600" aria-live="polite">{error}</p>}

      {view === 'prep' ? (
        <div className="grid gap-2">
          {[...prep.values()].sort((a, b) => b.qty - a.qty).map((p) => (
            <div key={p.name} className="flex items-center gap-3 rounded-xl border bg-white p-4 text-lg">
              <span className="font-bold">{p.qty} ×</span>
              <span>{p.name}</span>
            </div>
          ))}
          {prep.size === 0 && <p className="text-sm text-gray-500">Nothing to prep yet.</p>}
        </div>
      ) : (
        drop.pickup.windows.map((w) => {
          const windowOrders = orders
            .filter((o) => o.pickup_window_id === w.id && o.status !== 'pending' && o.status !== 'canceled')
            .sort((a, b) => (a.pickup_slot ?? '').localeCompare(b.pickup_slot ?? '') || (a.number ?? 0) - (b.number ?? 0))
          return (
            <section key={w.id} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-600">
                {w.day} · {w.start}–{w.end} · {drop.pickup.location_name}
              </h2>
              <div className="grid gap-2">
                {windowOrders.map((o) => (
                  <div key={o.id}
                    className={`rounded-xl border bg-white p-4 ${o.status === 'picked_up' ? 'opacity-50' : ''} ${o.status === 'refunded' ? 'opacity-50 line-through' : ''}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold">#{o.number} <span className="font-normal">{o.buyer.name}</span></p>
                      <p className="text-sm text-gray-500">{o.pickup_slot ?? ''} {money(o.total)}</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {o.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')}
                    </p>
                    <div className="mt-3 flex gap-2">
                      {o.status === 'confirmed' && (
                        <Button className="flex-1 py-5" disabled={busyId === o.id}
                          onClick={() => act(o.id, () => markOrderPickedUp(orgId, o.id), 'picked_up')}>
                          Picked up
                        </Button>
                      )}
                      {isAdmin && (o.status === 'confirmed' || o.status === 'picked_up') && (
                        <Button variant="outline" disabled={busyId === o.id}
                          onClick={() => {
                            if (window.confirm(`Refund order #${o.number} (${money(o.total)}) to ${o.buyer.name}?`)) {
                              act(o.id, () => cancelOrder(orgId, o.id), 'refunded')
                            }
                          }}>
                          Cancel & refund
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {windowOrders.length === 0 && <p className="text-sm text-gray-400">No orders in this window.</p>}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/actions/orders.test.ts __tests__/components/admin/storefront/OrdersBoardClient.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/orders.ts "app/(admin)/[orgSlug]/drop-orders/[dropId]/page.tsx" components/admin/storefront/OrdersBoardClient.tsx __tests__/actions/orders.test.ts __tests__/components/admin/storefront/OrdersBoardClient.test.tsx
git commit -m "feat(drops): orders board — mobile-first pickup screen, prep view, cancel+refund"
```

---

### Task 17: Calendar — `drop` kind + ICS

**Files:**
- Modify: `lib/calendar.ts`, `lib/calendar-feed.ts`
- Test: extend `__tests__/lib/calendar.test.ts` and `__tests__/lib/calendar-feed.test.ts`

**Interfaces:**
- Consumes: `Drop` type; `listDropsCore` (Task 4).
- Produces: `CalendarKind` gains `'drop'` (label `'Drop pickup'` in `CALENDAR_KIND_LABELS` — SubscribePanel checkboxes and the ICS `?include=` filter pick it up automatically via `CALENDAR_KINDS`); `CalendarFeedSources` gains `drops: Drop[]`; one item per pickup-window day per scheduled/closed drop. Items land in the calendar's "owed" band via the existing `OwedEntry` fallback (`TIME_KINDS` untouched — deliberate v1 choice).

- [ ] **Step 1: Write the failing tests.** Extend `__tests__/lib/calendar.test.ts` (match its existing fixture style — it builds a `CalendarFeedSources` object; add `drops: []` to existing fixtures as needed to satisfy the type, then add):

```ts
  it('emits one drop item per pickup-window day for scheduled drops, skipping drafts/archived', () => {
    const drop = {
      id: 'd1', title: 'Weekend Drop', status: 'scheduled' as const,
      opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z', timezone: 'UTC',
      pickup: {
        location_name: 'SW Boise',
        windows: [
          { id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' },
          { id: 'w2', day: '2026-08-23', start: '08:00', end: '10:00' },
          { id: 'w3', day: '2026-08-22', start: '15:00', end: '17:00' },   // same day → deduped
        ],
      },
      items: [], channels: [], created_at: 'x',
    }
    const items = buildCalendarFeed('acme', { ...EMPTY_SOURCES, drops: [drop] })
    const dropItems = items.filter((i) => i.kind === 'drop')
    expect(dropItems).toHaveLength(2)
    expect(dropItems[0]).toMatchObject({
      date: '2026-08-22', title: 'Drop pickup: Weekend Drop',
      href: '/acme/drop-orders/d1', detail: 'SW Boise',
    })
    const draftItems = buildCalendarFeed('acme', { ...EMPTY_SOURCES, drops: [{ ...drop, status: 'draft' as const }] })
    expect(draftItems.filter((i) => i.kind === 'drop')).toHaveLength(0)
  })
```

(`EMPTY_SOURCES` = whatever empty-sources fixture the file already uses, now including `drops: []`.) In `__tests__/lib/calendar-feed.test.ts`, extend the existing core mocks with `vi.mock('@/lib/storefront/drops', () => ({ listDropsCore: vi.fn().mockResolvedValue([]) }))` and assert `assembleCalendarFeed` passes its result through.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/calendar.test.ts __tests__/lib/calendar-feed.test.ts --exclude '**/.claude/**'`
Expected: FAIL — type error on `drops` / no drop items.

- [ ] **Step 3: Implement.** In `lib/calendar.ts`: add `'drop'` to `CalendarKind`; add `drop: 'Drop pickup'` to `CALENDAR_KIND_LABELS`; add `drops: Drop[]` to `CalendarFeedSources` (import the type); in `buildCalendarFeed`, after the invoice block:

```ts
  // drop — one entry per distinct pickup day of live (scheduled/closed) drops
  for (const d of s.drops) {
    if (d.status !== 'scheduled' && d.status !== 'closed') continue
    const days = [...new Set(d.pickup.windows.map((w) => w.day))]
    for (const day of days) {
      items.push({
        id: `${d.id}:${day}`,
        title: `Drop pickup: ${d.title}`,
        date: day,
        kind: 'drop',
        href: `/${orgSlug}/drop-orders/${d.id}`,
        detail: d.pickup.location_name,
      })
    }
  }
```

In `lib/calendar-feed.ts`: add `listDropsCore` to the parallel fetch and pass `drops` through:

```ts
import { listDropsCore } from '@/lib/storefront/drops'
// in Promise.all: const [events, leads, complianceDocs, invoices, drops] = await Promise.all([
//   …existing…, listDropsCore(orgId),
// ])
// …and: return buildCalendarFeed(orgSlug, { events, leads, tasksByLeadId, complianceDocs, invoices, drops })
```

Fix any other `CalendarFeedSources` construction sites the type error surfaces (the calendar page and its tests) by adding `drops: []` or real data.

- [ ] **Step 4: Run the full suite (this change fans out through types)**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar.ts lib/calendar-feed.ts __tests__/lib/calendar.test.ts __tests__/lib/calendar-feed.test.ts
git commit -m "feat(drops): calendar + ICS gain the drop-pickup kind"
```

---

### Task 18: Full verification + docs

**Files:**
- Modify: `docs/ROADMAP.md` (move drops from spec-stage to In flight / Shipped as appropriate)

- [ ] **Step 1: Full test suite** — `npx vitest run --exclude '**/.claude/**'` → all green.
- [ ] **Step 2: Build** — `npx next build` → succeeds (the memory-documented `'use server'` type-re-export failure mode surfaces here, not in vitest).
- [ ] **Step 3: Lint** — `npm run lint` → clean.
- [ ] **Step 4: Update `docs/ROADMAP.md`** — add the drops increment under "In flight" (or "Shipped" once merged) with the spec path, and note the ship checklist below in the PR description.
- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap — drops & online ordering increment built"
```

**Ship checklist (PR description / deploy notes — not code):**
1. `firebase deploy --only firestore:indexes` (new fieldOverrides for `orders.token` + `customers.marketing.unsubscribe_token`).
2. Stripe dashboard: add `charge.refunded` to the Connect webhook endpoint's enabled events (`STRIPE_PAYMENT_WEBHOOK_SECRET` endpoint).
3. Manual authenticated walk (emulator per memory `traxevent-emulator-walkthrough-setup`, or demo org): create products (with a photo) → create + publish a drop (verify announcement lands + `announced_at`) → public page order incl. a slotted window + tip → webhook confirm (pickup number, customer created, activity logged, receipt email) → orders board mark-picked-up on a phone-width viewport → cancel + refund → sold-out state on a stock-1 item → subscribe + unsubscribe round trip → calendar + ICS show the pickup day.
4. Launch caution from the brainstorm (memory): run one Love Brew drop side-by-side with Hot Plate before any cutover.

---

## Execution notes

- Use the `superpowers:using-git-worktrees` skill for isolation. Memory gotchas: EnterWorktree branches from `origin/main` — reset to local main and rename the branch after creating; fresh worktrees need `npm install` and a copied `.env.local` for `next build`; subagent implementers must verify their cwd before committing (memory: SDD worktree guard).
- Branch name: `drops-online-ordering`. Do not push without `gh auth switch` to the Lifewithmo account (memory).
- Tasks 1→10 are strictly ordered (each consumes the previous). Tasks 11–13 depend on 7–10. Task 14 depends on 1/3/4/5; 15 on 10/14; 16 on 5/14; 17 on 4. Within those constraints, 11–17 can interleave.




