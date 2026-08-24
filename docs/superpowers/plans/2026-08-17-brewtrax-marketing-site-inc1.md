# BrewTrax Marketing Site — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four wedge-carrier pages of the BrewTrax marketing site (Home, vs Hot Plate, Pricing, For mobile beverage) plus the shared craft system — the Fee Autopsy calculator and named Store Preview — served at `brewtrax.com`.

**Architecture:** BrewTrax pages are nested under the existing brand route `app/(marketing)/brand/[brandId]/` with a new brand-scoped `layout.tsx` supplying nav/footer/theme. `proxy.ts` rewrites `brewtrax.com/<path>` → `/brand/brewtrax/<path>`. The wedge logic lives in a pure, unit-tested `lib/fee-autopsy.ts`; the interactive pieces (`FeeAutopsy`, `StorePreview`, `Slider`) are `'use client'` leaf components. Presentational pages are server components that compose these.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` not `middleware.ts`, `params` is a Promise), React 19, Tailwind v4 (class-based dark, warm copper/greige tokens in `app/globals.css`), `@base-ui/react` + `cva` + `cn()` UI primitives, Inter font, vitest + @testing-library/react.

## Global Constraints

- **Design source of truth is `app/globals.css`** (warm greige/copper ramp, Inter). **IGNORE `docs/design-system.md`** — its blue/Plus-Jakarta tokens are stale.
- **Font:** Inter (already applied on `<body>` in `app/layout.tsx`). Do not add a font.
- **Per-brand accent** is applied via inline `style={{…}}` using `readableTextOn(accent)` from `@/lib/branding`, NOT Tailwind classes. Fixed chrome uses the copper ramp (`bg-copper-*`, `text-copper-*`).
- **Cross-origin CTAs** to signup/login use a plain `<a href={signupUrl('brewtrax')}>` / `<a href={loginUrl()}>` (from `@/lib/brands`) — NOT `next/link`. Internal links use `next/link`.
- **WCAG 2.2 AA** — 4.5:1 body / 3:1 large & UI; interactive targets ≥24×24px (≥44px touch). Re-check on any color choice.
- **`prefers-reduced-motion`** — any animation must be gated; add the global rule (Task 4). Not currently handled anywhere.
- **No blank empty states** — Proof Wall ships the founder-honest empty state; Fee Autopsy and Store Preview ship with sensible pre-filled defaults, never a $0/blank result.
- **CTA microcopy** — every `Start free` de-risks the click: "no credit card · live in minutes".
- **Pricing:** three flat tiers **$39 / $79 / $149**, `$79` anchored "most popular"; **0% per-order on all tiers** (state it). Free trial, no separate free plan.
- **No real operator testimonials exist** — never fabricate; use the empty state.
- **Tests must run** `npx vitest run --exclude '**/.claude/**'` from the primary checkout; a task is done only when that passes. Final task also runs `npx next build`.
- Tests live in `__tests__/` mirroring source; naming `Name.test.tsx` / `name.test.ts`.
- `AGENTS.md`: this is a modified Next.js — consult `node_modules/next/dist/docs/` before routing/rendering changes.

---

## File Structure

**Create:**
- `components/ui/slider.tsx` — range slider primitive (Base UI wrapper).
- `lib/fee-autopsy.ts` — pure fee math (no React).
- `components/marketing/FeeAutopsy.tsx` — interactive calculator (client).
- `components/marketing/StorePreview.tsx` — named live store preview (client).
- `components/marketing/ComparisonMatrix.tsx` — BrewTrax vs Hot Plate table.
- `components/marketing/ProofWallEmpty.tsx` — founder-honest empty proof state.
- `components/marketing/ObjectionBand.tsx` — reassurance chips.
- `components/marketing/CtaBand.tsx` — reflective closing CTA.
- `components/marketing/brewtrax-copy.ts` — all BrewTrax marketing copy in one module (DRY, one place to edit voice).
- `app/(marketing)/brand/[brandId]/layout.tsx` — brand-scoped nav/footer/theme chrome.
- `app/(marketing)/brand/[brandId]/pricing/page.tsx`
- `app/(marketing)/brand/[brandId]/vs/hotplate/page.tsx`
- `app/(marketing)/brand/[brandId]/for/mobile-beverage/page.tsx`
- Tests under `__tests__/` mirroring each.

**Modify:**
- `app/(marketing)/brand/[brandId]/page.tsx` — replace placeholder with the full Home spine.
- `lib/brands.ts` — update the brewtrax `marketing` copy to the new headline/subhead.
- `proxy.ts` — rewrite brewtrax-domain sub-paths to `/brand/brewtrax/<path>`.

---

### Task 1: Slider primitive

**Files:**
- Create: `components/ui/slider.tsx`
- Test: `__tests__/components/ui/slider.test.tsx`

**Interfaces:**
- Consumes: `@base-ui/react/slider`, `cn` from `@/lib/utils`.
- Produces: `Slider` component. Props: `{ value: number; onValueChange: (v: number) => void; min: number; max: number; step?: number; 'aria-label': string; id?: string }`. Single-thumb, controlled.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/ui/slider.test.tsx
import { render, screen } from '@testing-library/react'
import { Slider } from '@/components/ui/slider'

test('renders an accessible slider thumb with the given value and range', () => {
  render(
    <Slider value={20} onValueChange={() => {}} min={0} max={100} aria-label="Orders per drop" />
  )
  const slider = screen.getByRole('slider', { name: 'Orders per drop' })
  expect(slider).toHaveAttribute('aria-valuenow', '20')
  expect(slider).toHaveAttribute('aria-valuemin', '0')
  expect(slider).toHaveAttribute('aria-valuemax', '100')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/slider.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/components/ui/slider`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/ui/slider.tsx
'use client'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'

export function Slider({
  value, onValueChange, min, max, step = 1, id, className,
  'aria-label': ariaLabel,
}: {
  value: number
  onValueChange: (v: number) => void
  min: number
  max: number
  step?: number
  id?: string
  className?: string
  'aria-label': string
}) {
  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(Array.isArray(v) ? v[0] : v)}
      min={min}
      max={max}
      step={step}
      className={cn('relative flex w-full touch-none select-none items-center py-2', className)}
    >
      <SliderPrimitive.Control className="flex w-full items-center">
        <SliderPrimitive.Track className="h-1.5 w-full rounded-full bg-copper-100">
          <SliderPrimitive.Indicator className="rounded-full bg-copper-500" />
          <SliderPrimitive.Thumb
            id={id}
            aria-label={ariaLabel}
            className="size-5 rounded-full bg-copper-600 shadow ring-2 ring-white focus-visible:outline-2 focus-visible:outline-copper-700"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
```

Note: verify the exact Base UI slider subcomponent names against `node_modules/@base-ui/react/slider` before finalizing (the library ships `Root/Control/Track/Indicator/Thumb`; adjust if the installed version differs). The thumb must carry the `aria-label` so the `role="slider"` test passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/slider.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/slider.tsx __tests__/components/ui/slider.test.tsx
git commit -m "feat(ui): add Slider primitive for Fee Autopsy"
```

---

### Task 2: Fee Autopsy math (pure logic)

**Files:**
- Create: `lib/fee-autopsy.ts`
- Test: `__tests__/lib/fee-autopsy.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `HOTPLATE_FEE = { rate: 0.05, perOrder: 0.55 }` (const).
  - `computeFeeAutopsy(input: { ordersPerDrop: number; dropsPerMonth: number; avgOrderValue: number }): { monthlyOrders: number; monthlyRevenue: number; hotplateMonthlyFee: number; hotplateAnnualFee: number; brewtraxFee: 0; monthlyKept: number; annualKept: number }`.
  - `formatUsd(n: number): string` → `"$3,912"` (whole dollars, no cents) and `formatUsdCents` for the worked example.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/fee-autopsy.test.ts
import { computeFeeAutopsy, HOTPLATE_FEE, formatUsd } from '@/lib/fee-autopsy'

test('computes Hot Plate fees and the amount BrewTrax lets you keep', () => {
  // 30 orders/drop × 4 drops/mo = 120 orders/mo; avg $20 → $2,400/mo revenue
  const r = computeFeeAutopsy({ ordersPerDrop: 30, dropsPerMonth: 4, avgOrderValue: 20 })
  expect(r.monthlyOrders).toBe(120)
  expect(r.monthlyRevenue).toBe(2400)
  // Hot Plate: 5% of $2,400 = $120, + $0.55 × 120 = $66 → $186/mo
  expect(r.hotplateMonthlyFee).toBeCloseTo(186, 2)
  expect(r.hotplateAnnualFee).toBeCloseTo(2232, 2)
  expect(r.brewtraxFee).toBe(0)
  expect(r.monthlyKept).toBeCloseTo(186, 2)
  expect(r.annualKept).toBeCloseTo(2232, 2)
})

test('HOTPLATE_FEE matches the published rate', () => {
  expect(HOTPLATE_FEE).toEqual({ rate: 0.05, perOrder: 0.55 })
})

test('formatUsd renders whole dollars with a thousands separator and no cents', () => {
  expect(formatUsd(3912.4)).toBe('$3,912')
  expect(formatUsd(0)).toBe('$0')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/fee-autopsy.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/lib/fee-autopsy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/fee-autopsy.ts
export const HOTPLATE_FEE = { rate: 0.05, perOrder: 0.55 } as const

export interface FeeAutopsyInput {
  ordersPerDrop: number
  dropsPerMonth: number
  avgOrderValue: number
}

export function computeFeeAutopsy(input: FeeAutopsyInput) {
  const monthlyOrders = input.ordersPerDrop * input.dropsPerMonth
  const monthlyRevenue = monthlyOrders * input.avgOrderValue
  const hotplateMonthlyFee = monthlyRevenue * HOTPLATE_FEE.rate + monthlyOrders * HOTPLATE_FEE.perOrder
  const hotplateAnnualFee = hotplateMonthlyFee * 12
  return {
    monthlyOrders,
    monthlyRevenue,
    hotplateMonthlyFee,
    hotplateAnnualFee,
    brewtraxFee: 0 as const,
    monthlyKept: hotplateMonthlyFee, // what BrewTrax's 0% lets you keep vs Hot Plate
    annualKept: hotplateAnnualFee,
  }
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.round(n))
}

export function formatUsdCents(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/fee-autopsy.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fee-autopsy.ts __tests__/lib/fee-autopsy.test.ts
git commit -m "feat: add fee-autopsy pure fee math"
```

---

### Task 3: FeeAutopsy component

**Files:**
- Create: `components/marketing/FeeAutopsy.tsx`
- Test: `__tests__/components/marketing/FeeAutopsy.test.tsx`

**Interfaces:**
- Consumes: `Slider` (Task 1), `computeFeeAutopsy` + `formatUsd` (Task 2), `Card` from `@/components/ui/card`.
- Produces: `FeeAutopsy` component. Props: `{ defaults?: Partial<FeeAutopsyInput>; heading?: string }`. Ships with defaults `{ ordersPerDrop: 25, dropsPerMonth: 4, avgOrderValue: 18 }` so the result is never blank.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/marketing/FeeAutopsy.test.tsx
import { render, screen } from '@testing-library/react'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'

test('renders a non-zero annual-kept figure from the default inputs', () => {
  render(<FeeAutopsy />)
  // defaults: 25×4=100 orders/mo, $18 avg → rev $1,800/mo
  // hp fee/mo = 0.05×1800 + 0.55×100 = 90 + 55 = 145 → annual 1,740
  expect(screen.getByTestId('autopsy-annual-kept')).toHaveTextContent('$1,740')
  // three labelled sliders present and accessible
  expect(screen.getByRole('slider', { name: /orders per drop/i })).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: /drops per month/i })).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: /average order/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/marketing/FeeAutopsy.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/FeeAutopsy.tsx
'use client'
import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Card } from '@/components/ui/card'
import { computeFeeAutopsy, formatUsd, type FeeAutopsyInput } from '@/lib/fee-autopsy'

const FALLBACK: FeeAutopsyInput = { ordersPerDrop: 25, dropsPerMonth: 4, avgOrderValue: 18 }

export function FeeAutopsy({ defaults, heading = 'How much are fees costing you?' }:
  { defaults?: Partial<FeeAutopsyInput>; heading?: string }) {
  const [input, setInput] = useState<FeeAutopsyInput>({ ...FALLBACK, ...defaults })
  const r = computeFeeAutopsy(input)
  const set = (k: keyof FeeAutopsyInput) => (v: number) => setInput((s) => ({ ...s, [k]: v }))

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
      <div className="mt-4 space-y-5">
        <Field label="Orders per drop" value={input.ordersPerDrop}
          min={5} max={200} onChange={set('ordersPerDrop')} format={(n) => `${n}`} />
        <Field label="Drops per month" value={input.dropsPerMonth}
          min={1} max={30} onChange={set('dropsPerMonth')} format={(n) => `${n}`} />
        <Field label="Average order value" value={input.avgOrderValue}
          min={5} max={80} onChange={set('avgOrderValue')} format={formatUsd} />
      </div>
      <div className="mt-6 rounded-lg bg-warm-950 p-4 text-warm-50">
        <div className="flex items-baseline justify-between text-sm">
          <span>Hot Plate takes per year</span>
          <span className="text-lg font-bold text-status-alert-fg">−{formatUsd(r.hotplateAnnualFee)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between text-sm">
          <span>On BrewTrax you keep</span>
          <span data-testid="autopsy-annual-kept" className="text-lg font-bold text-money-green">
            {formatUsd(r.annualKept)}
          </span>
        </div>
        <p className="mt-3 text-xs text-warm-300">
          Flat monthly subscription, 0% per order. Only Stripe’s processing (2.9% + 30¢) passes
          straight through — we add nothing on top.
        </p>
      </div>
    </Card>
  )
}

function Field({ label, value, min, max, onChange, format }: {
  label: string; value: number; min: number; max: number
  onChange: (v: number) => void; format: (n: number) => string
}) {
  return (
    <div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <label>{label}</label>
        <span className="font-medium text-foreground">{format(value)}</span>
      </div>
      <Slider aria-label={label} value={value} min={min} max={max} onValueChange={onChange} />
    </div>
  )
}
```

Note: confirm token utility classes exist (`text-money-green`, `text-status-alert-fg`, `bg-warm-950`, `text-warm-50/300`) resolve from `globals.css`; if a semantic var isn't exposed as a utility, use the nearest exposed one (`text-[color:var(--money-green)]` inline form is acceptable).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/marketing/FeeAutopsy.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/FeeAutopsy.tsx __tests__/components/marketing/FeeAutopsy.test.tsx
git commit -m "feat(marketing): Fee Autopsy calculator"
```

---

### Task 4: Brand-scoped marketing layout + reduced-motion

**Files:**
- Create: `app/(marketing)/brand/[brandId]/layout.tsx`
- Create: `components/marketing/brewtrax-copy.ts`
- Modify: `app/globals.css` (append the reduced-motion rule)
- Test: `__tests__/app/brewtrax-layout.test.tsx`

**Interfaces:**
- Consumes: `getBrand`, `validBrandParam`, `signupUrl`, `loginUrl` from `@/lib/brands`; `notFound` from `next/navigation`.
- Produces: default layout export wrapping `children` in `<MarketingNav>` + `<MarketingFooter>` (defined inline in the file). `brewtrax-copy.ts` exports `BREWTRAX` object with all page copy (see below), consumed by every page task.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/brewtrax-layout.test.tsx
import { render, screen } from '@testing-library/react'
import BrandLayout from '@/app/(marketing)/brand/[brandId]/layout'

test('renders BrewTrax nav with a Start free CTA to the app origin', async () => {
  const ui = await BrandLayout({ children: <div>page</div>, params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  const cta = screen.getByRole('link', { name: /start free/i })
  expect(cta).toHaveAttribute('href', 'https://traxevent.com/signup?brand=brewtrax')
  expect(screen.getByRole('link', { name: /vs hot plate/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/brewtrax-layout.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// components/marketing/brewtrax-copy.ts
export const BREWTRAX = {
  nav: [
    { label: 'Features', href: '/brand/brewtrax/features' },
    { label: 'Pricing', href: '/brand/brewtrax/pricing' },
    { label: 'vs Hot Plate', href: '/brand/brewtrax/vs/hotplate' },
  ],
  ctaMicrocopy: 'No credit card · live in minutes',
  hero: {
    eyebrow: 'For coffee carts & mobile bars',
    headline: ['Your store. Your customers.', 'Every dollar.'],
    sub: 'Sell your weekly drops online with zero per-order fees — then run the bookings, proposals, invoices, and event-day prep from the same place.',
    dropsEscapeHatch: 'Just here for drops? →',
  },
  wedge: {
    title: 'Your money. All of it.',
    body: 'Hot Plate adds 5% + 55¢ to every order. We add $0. We charge a flat monthly subscription — so we never need a cut of your sales.',
  },
  os: [
    { step: 'Book', body: 'Inquiry form → proposal → deposit, signed and paid.' },
    { step: 'Prep', body: 'Menu, shopping list, staffing, event-day checklist.' },
    { step: 'Serve', body: 'Show up ready. Run drops & pickups on the side.' },
    { step: 'Get paid', body: 'Final invoice, reporting, follow-up for the next one.' },
  ],
  objections: [
    { q: 'What does it cost?', a: 'Flat $39–$149/mo. 0% per order on every tier.' },
    { q: 'Will my customers use it?', a: 'They order from a link — no app, no account.' },
    { q: 'Can I leave?', a: 'Export your data anytime. No contract.' },
    { q: 'Is it legit?', a: 'Payments run on Stripe. Your money goes straight to you.' },
  ],
  close: { title: 'Keep what you earn.', cta: 'Claim your page' },
} as const
```

```tsx
// app/(marketing)/brand/[brandId]/layout.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { validBrandParam, signupUrl, loginUrl } from '@/lib/brands'
import { BREWTRAX } from '@/components/marketing/brewtrax-copy'

export default async function BrandLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/brand/brewtrax" className="font-extrabold text-copper-700">☕ BrewTrax</Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {BREWTRAX.nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">{n.label}</Link>
          ))}
          <a href={loginUrl()} className="hover:text-foreground">Sign in</a>
          <a href={signupUrl(brandId)}><Button size="sm">Start free</Button></a>
        </nav>
      </header>
      {children}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted-foreground">
        ☕ BrewTrax — by TraxEvent · <a href={signupUrl(brandId)} className="text-link">Start free</a>
      </footer>
    </div>
  )
}
```

```css
/* append to app/globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/brewtrax-layout.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand/[brandId]/layout.tsx" components/marketing/brewtrax-copy.ts app/globals.css __tests__/app/brewtrax-layout.test.tsx
git commit -m "feat(marketing): brand-scoped BrewTrax layout + reduced-motion"
```

---

### Task 5: StorePreview component

**Files:**
- Create: `components/marketing/StorePreview.tsx`
- Test: `__tests__/components/marketing/StorePreview.test.tsx`

**Interfaces:**
- Consumes: `DropStorefront` from `@/components/storefront/DropStorefront`, the `PublicDrop` type from `@/actions/storefront-public`.
- Produces: `StorePreview` component. Props: `{ defaultName?: string }`. Renders a name input; as the operator types, builds a mock `PublicDrop` (`org.display_name = name || 'Your Cart'`) and renders `<DropStorefront>` with a sample coffee-cart menu. Never blank — defaults to a sample cart name.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/marketing/StorePreview.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { StorePreview } from '@/components/marketing/StorePreview'

// DropStorefront hits branding helpers; render it for real but assert on the name echo.
test('echoes the typed cart name into the previewed store header', () => {
  render(<StorePreview />)
  const input = screen.getByLabelText(/cart name/i)
  fireEvent.change(input, { target: { value: 'Love Brew' } })
  expect(screen.getByTestId('store-preview')).toHaveTextContent('Love Brew')
})

test('never renders blank — shows a sample cart name by default', () => {
  render(<StorePreview />)
  expect(screen.getByTestId('store-preview')).toHaveTextContent(/your cart/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/marketing/StorePreview.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/StorePreview.tsx
'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropStorefront } from '@/components/storefront/DropStorefront'
import type { PublicDrop } from '@/actions/storefront-public'

function sampleDrop(name: string): PublicDrop {
  const cart = name.trim() || 'Your Cart'
  return {
    id: 'preview', title: 'Friday Drop', note: 'Pre-order by Thursday night',
    phase: 'open', opens_at: '', closes_at: '', timezone: 'America/Boise',
    pickup: { kind: 'pickup', address: 'Your market spot', window: 'Fri 7–11a' } as PublicDrop['pickup'],
    items: [
      { product_id: '1', name: 'Cold Brew Flight', price: 6, sold_out: false },
      { product_id: '2', name: 'Chilled Can Latte 4-pack', price: 18, sold_out: false },
      { product_id: '3', name: 'Weekday Drip', price: 4, sold_out: false },
    ],
    tips_enabled: true, tax_rate: 0,
    org: { display_name: cart, handle: 'your-cart', accent_color: '#78350f' },
  }
}

export function StorePreview({ defaultName = '' }: { defaultName?: string }) {
  const [name, setName] = useState(defaultName)
  return (
    <div>
      <div className="mb-4 max-w-sm">
        <Label htmlFor="cart-name">Your cart name</Label>
        <Input id="cart-name" placeholder="e.g. Love Brew" value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div data-testid="store-preview" className="rounded-xl ring-1 ring-foreground/10">
        <DropStorefront drop={sampleDrop(name)} />
      </div>
    </div>
  )
}
```

Note: verify the `PublicDrop.pickup` shape in `actions/storefront-public.ts` and match the mock to it exactly (the `as` cast is a stopgap — replace with the real `DropPickup` fields). If `DropStorefront`'s checkout step calls a server action on interaction, the preview is fine because the test only types a name and asserts the header; do not drive the add-to-cart flow in the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/marketing/StorePreview.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/StorePreview.tsx __tests__/components/marketing/StorePreview.test.tsx
git commit -m "feat(marketing): named live Store Preview"
```

---

### Task 6: Supporting marketing components (ComparisonMatrix, ProofWallEmpty, ObjectionBand, CtaBand)

**Files:**
- Create: `components/marketing/ComparisonMatrix.tsx`, `components/marketing/ProofWallEmpty.tsx`, `components/marketing/ObjectionBand.tsx`, `components/marketing/CtaBand.tsx`
- Test: `__tests__/components/marketing/supporting.test.tsx`

**Interfaces:**
- `ComparisonMatrix`: no props; renders a table of rows comparing BrewTrax vs Hot Plate.
- `ProofWallEmpty`: no props; founder-honest empty state + trust primitives.
- `ObjectionBand`: `{ items: readonly { q: string; a: string }[] }`.
- `CtaBand`: `{ brandId: string; title: string; cta: string }` — reflective closing CTA linking to `signupUrl(brandId)`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/marketing/supporting.test.tsx
import { render, screen } from '@testing-library/react'
import { ComparisonMatrix } from '@/components/marketing/ComparisonMatrix'
import { ProofWallEmpty } from '@/components/marketing/ProofWallEmpty'
import { ObjectionBand } from '@/components/marketing/ObjectionBand'
import { CtaBand } from '@/components/marketing/CtaBand'

test('ComparisonMatrix contrasts the per-order fee', () => {
  render(<ComparisonMatrix />)
  expect(screen.getByText(/5% \+ 55¢/)).toBeInTheDocument()
  expect(screen.getByText(/\$0 per order/i)).toBeInTheDocument()
})

test('ProofWallEmpty is founder-honest, not a fake testimonial', () => {
  render(<ProofWallEmpty />)
  expect(screen.getByText(/we’re new|we're new/i)).toBeInTheDocument()
  expect(screen.getByText(/export/i)).toBeInTheDocument()
})

test('ObjectionBand renders each objection', () => {
  render(<ObjectionBand items={[{ q: 'Can I leave?', a: 'Export anytime.' }]} />)
  expect(screen.getByText('Can I leave?')).toBeInTheDocument()
})

test('CtaBand links to signup for the brand', () => {
  render(<CtaBand brandId="brewtrax" title="Keep what you earn." cta="Claim your page" />)
  expect(screen.getByRole('link', { name: /claim your page/i }))
    .toHaveAttribute('href', 'https://traxevent.com/signup?brand=brewtrax')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/marketing/supporting.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/marketing/ComparisonMatrix.tsx
const ROWS: { label: string; brewtrax: string; hotplate: string }[] = [
  { label: 'Per-order fee', brewtrax: '$0 per order', hotplate: '5% + 55¢' },
  { label: 'Surcharge shown to your customer', brewtrax: 'None', hotplate: '~$2.30 on a $20 order' },
  { label: 'Bookings, proposals, invoices', brewtrax: 'Included', hotplate: 'Not offered' },
  { label: 'Event-day checklists', brewtrax: 'Included', hotplate: 'Not offered' },
  { label: 'Runs on your phone', brewtrax: 'Yes', hotplate: 'Yes' },
  { label: 'Export your data / no contract', brewtrax: 'Yes', hotplate: 'Limited' },
]
export function ComparisonMatrix() {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left">
          <th className="py-2"></th>
          <th className="py-2 text-copper-700">BrewTrax</th>
          <th className="py-2 text-muted-foreground">Hot Plate</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <td className="py-3 pr-4 text-muted-foreground">{r.label}</td>
            <td className="py-3 pr-4 font-medium text-foreground">{r.brewtrax}</td>
            <td className="py-3 text-muted-foreground">{r.hotplate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

```tsx
// components/marketing/ProofWallEmpty.tsx
export function ProofWallEmpty() {
  return (
    <div className="rounded-xl bg-warm-100 p-6 text-center">
      <p className="text-lg font-semibold text-foreground">We’re new — and honest about it.</p>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
        BrewTrax is built hand-in-hand with working mobile-beverage operators. No fake reviews here.
        What we’ll promise instead:
      </p>
      <ul className="mx-auto mt-4 flex max-w-xl flex-col gap-2 text-sm text-foreground sm:flex-row sm:justify-center">
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">Payments on Stripe</li>
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">Export your data anytime</li>
        <li className="rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">No contract, cancel anytime</li>
      </ul>
    </div>
  )
}
```

```tsx
// components/marketing/ObjectionBand.tsx
export function ObjectionBand({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.q} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <dt className="font-medium text-foreground">{it.q}</dt>
          <dd className="mt-1 text-sm text-muted-foreground">{it.a}</dd>
        </div>
      ))}
    </dl>
  )
}
```

```tsx
// components/marketing/CtaBand.tsx
import { signupUrl } from '@/lib/brands'
import { Button } from '@/components/ui/button'
export function CtaBand({ brandId, title, cta }: { brandId: string; title: string; cta: string }) {
  return (
    <section className="bg-copper-600 py-14 text-center text-white">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-white/80">No credit card · live in minutes</p>
      <a href={signupUrl(brandId)} className="mt-5 inline-block">
        <Button size="lg" variant="secondary">{cta}</Button>
      </a>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/marketing/supporting.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/ComparisonMatrix.tsx components/marketing/ProofWallEmpty.tsx components/marketing/ObjectionBand.tsx components/marketing/CtaBand.tsx __tests__/components/marketing/supporting.test.tsx
git commit -m "feat(marketing): comparison, proof-empty, objections, CTA band"
```

---

### Task 7: Home page (assemble the spine)

**Files:**
- Modify: `app/(marketing)/brand/[brandId]/page.tsx` (replace placeholder body)
- Modify: `lib/brands.ts` (update brewtrax `marketing` copy)
- Test: `__tests__/app/brewtrax-home.test.tsx`

**Interfaces:**
- Consumes: `BREWTRAX` copy, `FeeAutopsy`, `StorePreview`, `ProofWallEmpty`, `ObjectionBand`, `CtaBand`; `getBrand`, `validBrandParam`, `signupUrl`.
- Produces: the Home page. Sections in order: Hero (with fold-level FeeAutopsy) → wedge → StorePreview → OS steps → ProofWallEmpty → ObjectionBand → CtaBand.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/brewtrax-home.test.tsx
import { render, screen } from '@testing-library/react'
import Home from '@/app/(marketing)/brand/[brandId]/page'

test('home leads with the coffee-cart headline and shows the fee autopsy at the fold', async () => {
  const ui = await Home({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/every dollar/i)
  // FeeAutopsy present in the hero (its result testid)
  expect(screen.getByTestId('autopsy-annual-kept')).toBeInTheDocument()
  // drops escape-hatch to the vs page
  expect(screen.getByRole('link', { name: /just here for drops/i }))
    .toHaveAttribute('href', '/brand/brewtrax/vs/hotplate')
  // proof is the honest empty state, not a fake quote
  expect(screen.getByText(/we’re new|we're new/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/brewtrax-home.test.tsx --exclude '**/.claude/**'`
Expected: FAIL (current page renders old placeholder, no autopsy).

- [ ] **Step 3: Write minimal implementation**

Update the brewtrax entry in `lib/brands.ts`:

```ts
    marketing: {
      headline: 'Your store. Your customers. Every dollar.',
      subhead:
        'Sell your weekly drops online with zero per-order fees — and run the whole business from one place.',
      cta: 'Start free',
    },
```

Replace `app/(marketing)/brand/[brandId]/page.tsx` body:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getBrand, validBrandParam, signupUrl } from '@/lib/brands'
import { BREWTRAX } from '@/components/marketing/brewtrax-copy'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { StorePreview } from '@/components/marketing/StorePreview'
import { ProofWallEmpty } from '@/components/marketing/ProofWallEmpty'
import { ObjectionBand } from '@/components/marketing/ObjectionBand'
import { CtaBand } from '@/components/marketing/CtaBand'

export async function generateMetadata({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const brand = getBrand(brandId)
  return { title: brand.name, description: brand.marketing.subhead }
}

export default async function Home({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  const c = BREWTRAX
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-copper-600">{c.hero.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            {c.hero.headline[0]}<br /><span className="text-copper-700">{c.hero.headline[1]}</span>
          </h1>
          <p className="mt-4 max-w-prose text-muted-foreground">{c.hero.sub}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={signupUrl(brandId)}><Button size="lg">Start free</Button></a>
            <span className="text-xs text-muted-foreground">{c.ctaMicrocopy}</span>
          </div>
          <Link href="/brand/brewtrax/vs/hotplate" className="mt-4 inline-block text-sm text-link">
            {c.hero.dropsEscapeHatch}
          </Link>
        </div>
        <FeeAutopsy heading="What fees are costing you" />
      </section>

      {/* Wedge */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">{c.wedge.title}</h2>
        <p className="mt-2 max-w-prose text-muted-foreground">{c.wedge.body}</p>
      </section>

      {/* Live store preview */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">See your store, fee-free</h2>
        <p className="mt-2 mb-6 max-w-prose text-muted-foreground">
          Type your cart name — this is the page your customers would order from.
        </p>
        <StorePreview />
      </section>

      {/* The OS */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">From “can you do my wedding?” to paid.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.os.map((s, i) => (
            <div key={s.step} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              <div className="text-sm font-bold text-copper-600">{i + 1}</div>
              <div className="mt-1 font-semibold">{s.step}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proof (empty state) */}
      <section className="mx-auto max-w-6xl px-4 py-10"><ProofWallEmpty /></section>

      {/* Objections */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <ObjectionBand items={c.objections} />
      </section>

      {/* Close */}
      <CtaBand brandId={brandId} title={c.close.title} cta={c.close.cta} />
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/brewtrax-home.test.tsx __tests__/lib/brands.test.ts --exclude '**/.claude/**'`
Expected: PASS (brands test still green with updated copy — update its assertion if it pinned the old headline).

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand/[brandId]/page.tsx" lib/brands.ts __tests__/app/brewtrax-home.test.tsx
git commit -m "feat(marketing): BrewTrax home page spine"
```

---

### Task 8: vs Hot Plate page

**Files:**
- Create: `app/(marketing)/brand/[brandId]/vs/hotplate/page.tsx`
- Test: `__tests__/app/brewtrax-vs-hotplate.test.tsx`

**Interfaces:**
- Consumes: `ComparisonMatrix`, `FeeAutopsy`, `CtaBand`, `validBrandParam`.
- Produces: the vs page. Must render the matrix + an embedded FeeAutopsy.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/brewtrax-vs-hotplate.test.tsx
import { render, screen } from '@testing-library/react'
import VsHotplate from '@/app/(marketing)/brand/[brandId]/vs/hotplate/page'

test('renders the comparison and the embedded calculator', async () => {
  const ui = await VsHotplate({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText(/5% \+ 55¢/)).toBeInTheDocument()
  expect(screen.getByTestId('autopsy-annual-kept')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/brewtrax-vs-hotplate.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/(marketing)/brand/[brandId]/vs/hotplate/page.tsx
import { notFound } from 'next/navigation'
import { validBrandParam } from '@/lib/brands'
import { ComparisonMatrix } from '@/components/marketing/ComparisonMatrix'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { CtaBand } from '@/components/marketing/CtaBand'

export const metadata = {
  title: 'BrewTrax vs Hot Plate',
  description: 'Sell your drops without the per-order fee. See what Hot Plate’s cut is really costing you.',
}

export default async function VsHotplate({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Leaving Hot Plate?</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          Same online drops — pre-orders, pickup windows, sell-outs — without the 5% + 55¢ taken from
          every order, and with the whole booking-to-paid business alongside it.
        </p>
        <div className="mt-8 grid gap-8 md:grid-cols-2 md:items-start">
          <ComparisonMatrix />
          <FeeAutopsy heading="What Hot Plate is costing you" />
        </div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Claim your page" />
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/brewtrax-vs-hotplate.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand/[brandId]/vs/hotplate/page.tsx" __tests__/app/brewtrax-vs-hotplate.test.tsx
git commit -m "feat(marketing): vs Hot Plate page"
```

---

### Task 9: Pricing page

**Files:**
- Create: `app/(marketing)/brand/[brandId]/pricing/page.tsx`
- Test: `__tests__/app/brewtrax-pricing.test.tsx`

**Interfaces:**
- Consumes: `FeeAutopsy`, `CtaBand`, `signupUrl`, `validBrandParam`, `Button`, `Card`.
- Produces: three tier cards ($39/$79/$149, $79 "Most popular"), the 0%-on-all-tiers note, and an embedded FeeAutopsy.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/brewtrax-pricing.test.tsx
import { render, screen } from '@testing-library/react'
import Pricing from '@/app/(marketing)/brand/[brandId]/pricing/page'

test('renders three tiers with $79 anchored and 0% per order on all', async () => {
  const ui = await Pricing({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText('$39')).toBeInTheDocument()
  expect(screen.getByText('$79')).toBeInTheDocument()
  expect(screen.getByText('$149')).toBeInTheDocument()
  expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  expect(screen.getByText(/0% per order/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/brewtrax-pricing.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/(marketing)/brand/[brandId]/pricing/page.tsx
import { notFound } from 'next/navigation'
import { validBrandParam, signupUrl } from '@/lib/brands'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { CtaBand } from '@/components/marketing/CtaBand'

const TIERS = [
  { name: 'Starter', price: '$39', blurb: 'One cart, drops + bookings.', popular: false },
  { name: 'Pro', price: '$79', blurb: 'Everything, plus team seats & advanced ops.', popular: true },
  { name: 'Growth', price: '$149', blurb: 'High-volume drops & multi-cart.', popular: false },
]

export const metadata = { title: 'BrewTrax Pricing', description: 'Flat monthly pricing. 0% per order, always.' }

export default async function Pricing({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Flat pricing. 0% of your sales.</h1>
        <p className="mt-3 text-muted-foreground">
          Every tier keeps <strong>0% per order</strong> — tiers only change scale and team features,
          never a cut of what you sell. Only Stripe’s processing (2.9% + 30¢) passes through.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.name} className={`p-6 ${t.popular ? 'ring-2 ring-copper-500' : ''}`}>
              {t.popular && <div className="mb-2 text-xs font-bold uppercase tracking-wide text-copper-600">Most popular</div>}
              <div className="text-lg font-semibold">{t.name}</div>
              <div className="mt-1 text-3xl font-extrabold">{t.price}<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
              <a href={signupUrl(brandId)} className="mt-4 block"><Button className="w-full">Start free</Button></a>
            </Card>
          ))}
        </div>
        <div className="mt-12 max-w-md"><FeeAutopsy heading="See your savings" /></div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Start free" />
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/brewtrax-pricing.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand/[brandId]/pricing/page.tsx" __tests__/app/brewtrax-pricing.test.tsx
git commit -m "feat(marketing): pricing page"
```

---

### Task 10: For mobile beverage page

**Files:**
- Create: `app/(marketing)/brand/[brandId]/for/mobile-beverage/page.tsx`
- Test: `__tests__/app/brewtrax-usecase.test.tsx`

**Interfaces:**
- Consumes: `CtaBand`, `validBrandParam`, `signupUrl`, `Button`.
- Produces: the vertical use-case page (coffee carts · espresso · mobile bars).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/brewtrax-usecase.test.tsx
import { render, screen } from '@testing-library/react'
import UseCase from '@/app/(marketing)/brand/[brandId]/for/mobile-beverage/page'

test('speaks to the three operator types', async () => {
  const ui = await UseCase({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText(/coffee cart/i)).toBeInTheDocument()
  expect(screen.getByText(/mobile bar/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/app/brewtrax-usecase.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/(marketing)/brand/[brandId]/for/mobile-beverage/page.tsx
import { notFound } from 'next/navigation'
import { validBrandParam } from '@/lib/brands'
import { CtaBand } from '@/components/marketing/CtaBand'

const KINDS = [
  { title: 'Coffee carts', body: 'Weekly drops, private events, and market days — one calendar, one menu.' },
  { title: 'Mobile espresso', body: 'Quote weddings and corporate gigs, then prep with an event-day checklist.' },
  { title: 'Mobile bars', body: 'Proposals, deposits, staffing, and compliance — booked to poured.' },
]

export const metadata = {
  title: 'BrewTrax for mobile beverage',
  description: 'Built for coffee carts, mobile espresso, and mobile bars.',
}

export default async function UseCase({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Built for the way you actually work.</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {KINDS.map((k) => (
            <div key={k.title} className="rounded-lg bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="font-semibold text-copper-700">{k.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{k.body}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Start free" />
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/app/brewtrax-usecase.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand/[brandId]/for/mobile-beverage/page.tsx" __tests__/app/brewtrax-usecase.test.tsx
git commit -m "feat(marketing): for-mobile-beverage use-case page"
```

---

### Task 11: Proxy wiring + full-suite + build verification

**Files:**
- Modify: `proxy.ts`
- Test: `__tests__/proxy-brewtrax.test.ts` (if `proxy.ts` exposes a testable rewrite helper; otherwise assert via the existing proxy test pattern)

**Interfaces:**
- Consumes: existing `getBrandByHostname` logic in `proxy.ts`.
- Produces: brewtrax-domain requests for `/pricing`, `/vs/hotplate`, `/for/mobile-beverage`, `/features` rewrite to `/brand/brewtrax/<path>` (today only `/` is rewritten).

- [ ] **Step 1: Read the current proxy rewrite logic**

Read `proxy.ts:1-50`. Confirm how `getBrandByHostname(host)` gates the `/ → /brand/{id}` rewrite (`:22-30`). The change: when a brand host matches AND the path is not already `/brand/...` and not an app/api path, rewrite `/<path>` → `/brand/{brand.id}/<path>` (so `/` → `/brand/brewtrax` still holds as the empty-path case).

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/proxy-brewtrax.test.ts
import { proxy } from '@/proxy'

function req(host: string, path: string) {
  return new Request(`https://${host}${path}`, { headers: { host } })
}

test('brewtrax domain rewrites sub-paths into the brand tree', async () => {
  const res = await proxy(req('brewtrax.com', '/pricing') as any)
  // NextResponse.rewrite sets x-middleware-rewrite (or equivalent); assert the destination path
  const dest = res.headers.get('x-middleware-rewrite') ?? ''
  expect(dest).toContain('/brand/brewtrax/pricing')
})
```

Note: match the assertion to how the existing proxy test inspects a rewrite (check `__tests__` for an existing `proxy` test and mirror its technique; Next 16's rewrite header name may differ — read `node_modules/next/dist/docs/` and the existing test first).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/proxy-brewtrax.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `/pricing` currently falls through unrewritten.

- [ ] **Step 4: Implement the rewrite**

In `proxy.ts`, extend the brand-host branch so a matched brand host rewrites `/<path>` → `/brand/{brand.id}/<path>` for non-asset, non-app paths (preserve the existing `/` → `/brand/{id}` case, org-subdomain logic, and the `_next`/`favicon` matcher exclusions). Keep `lib/brands.ts` dependency-free.

- [ ] **Step 5: Run the full suite + build**

```bash
npx vitest run --exclude '**/.claude/**'
npx next build
```
Expected: all tests PASS; `next build` succeeds (catches any `'use server'`/type/route errors the unit tests miss — see [[nextjs-use-server-no-type-reexport]]).

- [ ] **Step 6: Commit**

```bash
git add proxy.ts __tests__/proxy-brewtrax.test.ts
git commit -m "feat(marketing): route brewtrax.com sub-paths to the brand tree"
```

---

## Self-Review

**Spec coverage:**
- Home spine (§5.1) → Task 7 (hero + fold autopsy + wedge + preview + OS + proof-empty + objections + close). ✓
- Fee Autopsy centerpiece v1 (§6) → Tasks 1–3. ✓
- Store Preview (§6) → Task 5. ✓
- vs Hot Plate (§5.2) → Task 8. ✓
- Pricing $39/$79/$149, 0% all tiers (§5.3, Global Constraints) → Task 9. ✓
- For mobile beverage (§5.4) → Task 10. ✓
- Founder-honest empty proof (§5.6, §7) → Task 6 (`ProofWallEmpty`), used in Task 7. ✓
- Hosting at brewtrax.com / sub-path routing (§4) → Task 11. ✓
- Hard gates: reduced-motion → Task 4; no-blank states → default-filled autopsy (Task 3) + sample-name preview (Task 5) + ProofWallEmpty; CTA microcopy → layout/CtaBand/home; cross-origin CTA pattern → all pages. ✓
- **Deferred to later increments (out of scope here, tracked):** Features/Stories/About/Resources pages; full scrape-Mirror (spike-gated); dark-mode toggle wiring (tokens exist, no toggle — a later increment if we want a switch; the reduced-motion gate ships now); WCAG contrast audit + real product screenshots (a design-QA pass task in increment 2, since v1 uses the token system that is already AA-tuned per [[design-system-sync-status]]).

**Placeholder scan:** No TBD/TODO; every code step has real code. The two `Note:` callouts (Base UI slider subcomponent names; `PublicDrop.pickup` shape) are verification instructions against real installed code, not placeholders — the implementer confirms exact names at build time.

**Type consistency:** `FeeAutopsyInput` defined in Task 2, consumed in Task 3. `computeFeeAutopsy` return `annualKept`/`hotplateAnnualFee` used by the `autopsy-annual-kept` testid in Tasks 3/7/8. `signupUrl(brandId)`/`loginUrl()` signatures match `lib/brands.ts`. `PublicDrop` shape sourced from `actions/storefront-public.ts`. `BREWTRAX` copy keys defined in Task 4, consumed in Task 7.

**Open risk flagged for execution:** the existing `__tests__/lib/brands.test.ts` may assert the old brewtrax headline; Task 7 updates the copy, so that test must be updated in the same task (called out in Task 7 Step 4).

---

## Increment 2 & 3 (separate plans, not built here)
- **Inc 2:** Features (task-flow), Stories, About/Our Why, Resources (thin); WCAG contrast audit + real product screenshots; optional dark-mode toggle.
- **Inc 3:** Full Live Mirror — behind a feasibility + ToS/legal spike (§6). Do not start without the spike's green light.
