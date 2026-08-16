# Client Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Clients list + client detail into a three-pane "Cockpit" (persistent queue rail · record spine · working rail) at full record depth — real per-customer AR and auto-captured activity — on a shared component kit that the proposal builder will reuse next.

**Architecture:** A new nested route layout (`clients/layout.tsx`) holds a persistent master rail while the `[customerId]` detail renders alongside as `{children}` — Next 16 layouts don't re-render on navigation, so the rail stays mounted with real deep-linkable URLs. The record is composed from a new shared kit (`Avatar`, `StatTile`, `StatusPill`, `EmptyState`, `RelatedRecordCard`, `Menu` in `components/ui/`, all Base UI + cva). Money comes from a new pure per-customer AR aggregator over the customer's invoices (joined by lead-id fan-out); activity comes from extending the event vocabulary + five one-line `logActivity` hooks + read-time aggregation of the customer's own and its opportunities' events.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, TypeScript, Tailwind v4, `@base-ui/react ^1.5.0`, `class-variance-authority`, `lucide-react`, Firestore. Tests: vitest 4 + `@testing-library/react` + jsdom, in `__tests__/` mirroring source.

**Spec:** [docs/superpowers/specs/2026-08-15-client-cockpit-design.md](../specs/2026-08-15-client-cockpit-design.md)
**Mockup:** https://claude.ai/code/artifact/b0aeeb92-b403-4cce-a3f5-5ac732658536

## Global Constraints

- **Framework version behaviors:** `params` is a `Promise` — always `await params` in pages/layouts (client children use React `use()`). `cacheComponents` is OFF, so `loading.js` will not mask a layout's own Firestore fetch — keep the rail fetch cheap and wrap the detail child in `<Suspense>`.
- **Kit convention:** every new `components/ui/` brick wraps a `@base-ui/react` primitive (or is a plain themed element) using `cva` + `cn` from `@/lib/utils` + a `data-slot` attribute — mirror `components/ui/button.tsx` / `badge.tsx`. **No Radix, no Headless UI.**
- **Tokens only:** never raw Tailwind palette classes (`bg-yellow-100`, `amber-*`); use semantic tokens (`bg-primary`, `text-destructive`, `text-muted-foreground`) or the design tokens via arbitrary values (`bg-[var(--status-confirmed-bg)]`). Validate every new frame in dark mode.
- **Money from the invoice ledger only.** AR = invoices with `lifecycle === 'sent'`, excluding `draft` and `void`. Never add `Proposal.deposit_payment` to AR totals — deposits already materialize into deposit-type invoices (double-count guard). Derive payment/aging status **live** with `new Date()`; never trust the stored `Invoice.payment_status`.
- **Per-customer joins via lead-id fan-out** (`listLeadsByCustomerCore`), never a `where('customer_id')` query (the field is only conditionally stamped and absent on legacy invoices).
- **`logActivity` calls are best-effort, placed AFTER the authoritative write** (the helper swallows its own errors). Guard against double-log: invoice-paid gates on the transition *to* `paid`; deposit-paid sits inside the webhook idempotency guard; proposal-signed's two mutually-exclusive paths log once each.
- **No block-stacks / space-filling law:** compose to the operator's next decision; promote every rollup to a figure; empty states are message + one CTA; unset fields are `+ Add` affordances.
- **`npm run build` (`next build`) must pass before any branch is called green** — a `'use server'` type re-export passes `tsc` but breaks `next build`.
- **Browser walkthrough is mandatory** (Task 24) — prior increments shipped defects that passed green tests and review.

---

## Phase A — Shared component kit

### Task 1: `Avatar` primitive

**Files:**
- Create: `components/ui/avatar.tsx`
- Test: `__tests__/components/ui/avatar.test.tsx`

**Interfaces:**
- Produces: `Avatar({ name, src?, size?, className? })` where `size` ∈ `'sm'|'md'|'lg'`; renders an initials monogram (deterministic warm background from `name`) with optional image.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { Avatar } from '@/components/ui/avatar'

describe('Avatar', () => {
  it('renders up to two initials from the name', () => {
    render(<Avatar name="Marisol Vega" />)
    expect(screen.getByText('MV')).toBeInTheDocument()
  })
  it('is deterministic — same name yields the same background class', () => {
    const { container: a } = render(<Avatar name="Aiden Brooks" />)
    const { container: b } = render(<Avatar name="Aiden Brooks" />)
    expect(a.firstChild).toHaveClass(...Array.from((b.firstChild as HTMLElement).classList))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/avatar.test.tsx`
Expected: FAIL — cannot resolve `@/components/ui/avatar`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
  {
    variants: {
      size: { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-base" },
    },
    defaultVariants: { size: "md" },
  }
)

// Warm, on-brand monogram grounds (copper / moss / honey / terracotta / warm).
const BGS = ["#8a4e20", "#5d7a45", "#7d5a18", "#8c3524", "#6d5d4f", "#905525"] as const

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
}
function bgFor(seed: string): string {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s + seed.charCodeAt(i)) % BGS.length
  return BGS[s]
}

function Avatar({
  name, src, size, className,
}: { name: string; src?: string; className?: string } & VariantProps<typeof avatarVariants>) {
  return (
    <span data-slot="avatar" className={cn(avatarVariants({ size }), className)} style={{ backgroundColor: bgFor(name) }} aria-label={name}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initialsOf(name)}
    </span>
  )
}

export { Avatar, avatarVariants, initialsOf }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/avatar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/avatar.tsx __tests__/components/ui/avatar.test.tsx
git commit -m "feat(ui): add Avatar monogram primitive"
```

### Task 2: `StatTile` primitive (extract from PipelineStatsHeader.Kpi)

**Files:**
- Create: `components/ui/stat-tile.tsx`
- Test: `__tests__/components/ui/stat-tile.test.tsx`

**Interfaces:**
- Produces: `StatTile({ label, value, note?, tone?, className? })` where `tone` ∈ `'default'|'money'|'alert'`. A self-contained card tile (the reusable form of the private `Kpi()` in [components/admin/pipeline/PipelineStatsHeader.tsx:41](../../../components/admin/pipeline/PipelineStatsHeader.tsx)).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { StatTile } from '@/components/ui/stat-tile'

describe('StatTile', () => {
  it('renders label, value, and note', () => {
    render(<StatTile label="Open balance" value="$2,150" note="past due" tone="alert" />)
    expect(screen.getByText('Open balance')).toBeInTheDocument()
    expect(screen.getByText('$2,150')).toBeInTheDocument()
    expect(screen.getByText('past due')).toBeInTheDocument()
  })
  it('applies tabular-nums to the value for column alignment', () => {
    render(<StatTile label="Lifetime paid" value="$18,400" />)
    expect(screen.getByText('$18,400')).toHaveClass('tabular-nums')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/stat-tile.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const tileVariants = cva(
  "flex flex-col gap-0.5 rounded-xl border bg-card p-3 shadow-xs",
  {
    variants: {
      tone: {
        default: "border-border",
        money: "border-border",
        alert: "border-[var(--status-alert-bg)] bg-[color-mix(in_srgb,var(--status-alert-bg)_30%,var(--card))]",
      },
    },
    defaultVariants: { tone: "default" },
  }
)
const valueTone = { default: "", money: "text-[var(--money-green)]", alert: "text-destructive" } as const

function StatTile({
  label, value, note, tone = "default", className,
}: { label: string; value: string; note?: string; className?: string } & VariantProps<typeof tileVariants>) {
  return (
    <div data-slot="stat-tile" className={cn(tileVariants({ tone }), className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{label}</span>
      <span className={cn("text-[20px] font-semibold leading-tight tracking-[-.02em] tabular-nums", valueTone[tone ?? "default"])}>{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  )
}

export { StatTile, tileVariants }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/stat-tile.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/stat-tile.tsx __tests__/components/ui/stat-tile.test.tsx
git commit -m "feat(ui): add StatTile (reusable KPI tile)"
```

### Task 3: `StatusPill` primitive + dark-mode status tokens; retire `StatusBadge`

**Files:**
- Create: `components/ui/status-pill.tsx`
- Test: `__tests__/components/ui/status-pill.test.tsx`
- Modify: `app/globals.css` (add `.dark` definitions for `--status-*` and money tokens)
- Modify: `components/admin/FamiliesTable.tsx`, `components/admin/FamilySlideOver.tsx` (swap `StatusBadge` → `StatusPill`)
- Delete: `components/admin/StatusBadge.tsx`

**Interfaces:**
- Produces: `StatusPill({ tone, children, className? })` where `tone` ∈ `'confirmed'|'pending'|'alert'|'neutral'`; token-driven, replaces the raw-palette [components/admin/StatusBadge.tsx](../../../components/admin/StatusBadge.tsx).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/ui/status-pill'

describe('StatusPill', () => {
  it('renders its label', () => {
    render(<StatusPill tone="alert">Past-due</StatusPill>)
    expect(screen.getByText('Past-due')).toBeInTheDocument()
  })
  it('uses the confirmed status token, not a raw palette class', () => {
    render(<StatusPill tone="confirmed">Active</StatusPill>)
    const el = screen.getByText('Active')
    expect(el.className).toContain('var(--status-confirmed-bg)')
    expect(el.className).not.toContain('green-100')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/status-pill.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const pillVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current",
  {
    variants: {
      tone: {
        confirmed: "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
        pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
        alert: "bg-[var(--status-alert-bg)] text-[var(--status-alert-fg)]",
        neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function StatusPill({
  tone, className, children,
}: { className?: string; children: React.ReactNode } & VariantProps<typeof pillVariants>) {
  return <span data-slot="status-pill" className={cn(pillVariants({ tone }), className)}>{children}</span>
}

export { StatusPill, pillVariants }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/status-pill.test.tsx`
Expected: PASS

- [ ] **Step 5: Add dark-mode status tokens** (so pills read correctly in dark — the `.dark` block in [app/globals.css](../../../app/globals.css) currently omits `--status-*` and money tokens). Inside the `.dark { … }` block add:

```css
  --status-confirmed-bg: #22301a; --status-confirmed-fg: #bcd4a6;
  --status-pending-bg: #382d13;  --status-pending-fg: #e3c07a;
  --status-alert-bg: #3a1f18;    --status-alert-fg: #e6a793;
  --status-neutral-bg: #26201a;  --status-neutral-fg: #a9998a;
  --money-green: #9cbb7c;
```

- [ ] **Step 6: Migrate call sites and delete `StatusBadge`.** In `FamiliesTable.tsx` and `FamilySlideOver.tsx`, replace `<StatusBadge status={x} />` with a mapping to `StatusPill`:

```tsx
const FAMILY_TONE = { pending: 'pending', confirmed: 'confirmed', waitlisted: 'alert', cancelled: 'neutral' } as const
const FAMILY_LABEL = { pending: 'Pending', confirmed: 'Confirmed', waitlisted: 'Waitlist', cancelled: 'Cancelled' } as const
// <StatusPill tone={FAMILY_TONE[status]}>{FAMILY_LABEL[status]}</StatusPill>
```

Then `git rm components/admin/StatusBadge.tsx`.

- [ ] **Step 7: Verify nothing else imports StatusBadge, tests pass, build passes**

Run: `grep -rn "StatusBadge" components app __tests__ ; npx vitest run __tests__/components ; npm run build`
Expected: no `StatusBadge` references remain; tests PASS; build PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add token-driven StatusPill, retire raw-palette StatusBadge"
```

### Task 4: `EmptyState` primitive

**Files:**
- Create: `components/ui/empty-state.tsx`
- Test: `__tests__/components/ui/empty-state.test.tsx`

**Interfaces:**
- Produces: `EmptyState({ icon?, title, description?, action?, className? })` — message + one CTA (space-filling law rule 4).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'

it('renders title, description and an action slot', () => {
  render(<EmptyState title="No proposals yet" description="Send one to get started" action={<button>Draft one</button>} />)
  expect(screen.getByText('No proposals yet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Draft one' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/empty-state.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cn } from "@/lib/utils"

function EmptyState({
  icon, title, description, action, className,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center gap-2 px-4 py-6 text-center", className)}>
      {icon ? <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/empty-state.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/empty-state.tsx __tests__/components/ui/empty-state.test.tsx
git commit -m "feat(ui): add EmptyState primitive"
```

### Task 5: `Menu` (dropdown) primitive over Base UI

**Files:**
- Create: `components/ui/menu.tsx`
- Test: `__tests__/components/ui/menu.test.tsx`

**Interfaces:**
- Produces: `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` — thin wrappers over `@base-ui/react/menu` (mirror the wrapper structure in `components/ui/dialog.tsx`). Used for the entity-header overflow.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'

it('renders a trigger and reveals items when opened', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent><MenuItem onClick={() => {}}>Merge</MenuItem></MenuContent>
    </Menu>
  )
  await user.click(screen.getByText('Actions'))
  expect(await screen.findByText('Merge')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/menu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (follow the `@base-ui/react/menu` compound API — `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`; mirror how `components/ui/dialog.tsx` wraps `@base-ui/react/dialog`):

```tsx
import { Menu as BaseMenu } from "@base-ui/react/menu"
import { cn } from "@/lib/utils"

function Menu(props: BaseMenu.Root.Props) { return <BaseMenu.Root {...props} /> }

function MenuTrigger({ className, ...props }: BaseMenu.Trigger.Props) {
  return <BaseMenu.Trigger data-slot="menu-trigger" className={cn(className)} {...props} />
}

function MenuContent({ className, children, ...props }: BaseMenu.Popup.Props) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={6} align="end">
        <BaseMenu.Popup
          data-slot="menu-content"
          className={cn("z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none", className)}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

function MenuItem({ className, ...props }: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      data-slot="menu-item"
      className={cn("flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted data-highlighted:text-foreground", className)}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuContent, MenuItem }
```

> If the exact Base UI `menu` prop/type names differ in `^1.5.0`, open `node_modules/@base-ui/react/menu` and match them; keep the four exported names and the class strings unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/menu.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/menu.tsx __tests__/components/ui/menu.test.tsx
git commit -m "feat(ui): add Menu dropdown primitive over Base UI"
```

### Task 6: `RelatedRecordCard` primitive (extract from LeadProposalsClient row)

**Files:**
- Create: `components/ui/related-record-card.tsx`
- Test: `__tests__/components/ui/related-record-card.test.tsx`

**Interfaces:**
- Produces:
  - `type RelatedRow = { id: string; title: string; subtitle?: string; badge?: React.ReactNode; amount?: string; amountTone?: 'default'|'money'|'alert'; href?: string }`
  - `RelatedRecordCard({ title, count, rows, previewLimit?, newLabel?, onNew?, emptyTitle, emptyCtaLabel, onEmptyCta?, footer?, className? })`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { RelatedRecordCard } from '@/components/ui/related-record-card'

describe('RelatedRecordCard', () => {
  it('shows the count in the title and previews rows', () => {
    render(<RelatedRecordCard title="Proposals" count={2}
      rows={[{ id: '1', title: 'Huang Wedding', amount: '$5,400', amountTone: 'money' }]}
      emptyTitle="No proposals yet" emptyCtaLabel="Draft one" />)
    expect(screen.getByText('Proposals')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Huang Wedding')).toBeInTheDocument()
  })
  it('shows the empty state + CTA when there are no rows', () => {
    render(<RelatedRecordCard title="Invoices" count={0} rows={[]} emptyTitle="No invoices yet" emptyCtaLabel="Create invoice" />)
    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    expect(screen.getByText('Create invoice')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/related-record-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"

export type RelatedRow = {
  id: string; title: string; subtitle?: string; badge?: React.ReactNode
  amount?: string; amountTone?: "default" | "money" | "alert"; href?: string
}

const amountClass = { default: "", money: "text-[var(--money-green)]", alert: "text-destructive" } as const

function Row({ row }: { row: RelatedRow }) {
  const body = (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{row.title}</p>
        {row.subtitle ? <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {row.badge}
        {row.amount ? <span className={cn("text-[13px] font-semibold tabular-nums", amountClass[row.amountTone ?? "default"])}>{row.amount}</span> : null}
      </div>
    </div>
  )
  return row.href ? <Link href={row.href} className="block border-t border-border first:border-t-0 hover:bg-muted/50">{body}</Link>
    : <div className="border-t border-border first:border-t-0">{body}</div>
}

function RelatedRecordCard({
  title, count, rows, previewLimit = 3, newLabel = "+ New", onNew,
  emptyTitle, emptyCtaLabel, onEmptyCta, footer, className,
}: {
  title: string; count: number; rows: RelatedRow[]; previewLimit?: number
  newLabel?: string; onNew?: () => void; emptyTitle: string; emptyCtaLabel: string
  onEmptyCta?: () => void; footer?: React.ReactNode; className?: string
}) {
  const shown = rows.slice(0, previewLimit)
  return (
    <section data-slot="related-record-card" className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-semibold">{title}</h4>
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">{count}</span>
        </div>
        {onNew ? <Button variant="ghost" size="xs" onClick={onNew}>{newLabel}</Button> : null}
      </header>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} action={onEmptyCta ? <Button variant="outline" size="sm" onClick={onEmptyCta}>{emptyCtaLabel}</Button> : undefined} />
      ) : (
        <div>
          {shown.map((r) => <Row key={r.id} row={r} />)}
          {rows.length > previewLimit ? <p className="border-t border-border px-3 py-2 text-center text-xs font-medium text-[var(--link)]">View all {count} →</p> : null}
          {footer}
        </div>
      )}
    </section>
  )
}

export { RelatedRecordCard }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/related-record-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/related-record-card.tsx __tests__/components/ui/related-record-card.test.tsx
git commit -m "feat(ui): add RelatedRecordCard primitive"
```

---

## Phase B — Per-customer money (AR)

### Task 7: Pure invoice→customer filter + AR aggregator

**Files:**
- Create: `lib/crm/ar-rollup.ts`
- Test: `__tests__/lib/crm/ar-rollup.test.ts`

**Interfaces:**
- Consumes: `amountPaid`, `invoiceBalance`, `invoiceAmountDue` ([lib/invoices.ts](../../../lib/invoices.ts)); `derivePaymentStatus`, `deriveAging` ([lib/invoice-status.ts](../../../lib/invoice-status.ts)); `Invoice` ([lib/types.ts](../../../lib/types.ts)).
- Produces:
  - `filterInvoicesByLeadIds(invoices: Invoice[], leadIds: Iterable<string>): Invoice[]`
  - `interface CustomerAR { invoiced: number; paid: number; outstanding: number; overdueAmount: number; nextDueDate?: string; openCount: number }`
  - `customerAR(invoices: Invoice[], now: Date): CustomerAR`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { customerAR, filterInvoicesByLeadIds } from '@/lib/crm/ar-rollup'
import type { Invoice } from '@/lib/types'

// Minimal invoice factory — only the fields the money helpers read.
function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i', org_id: 'o', lead_id: 'L1', type: 'final', lifecycle: 'sent',
    line_items: [{ description: 'Cart', quantity: 1, unit_price: 1000 }],
    payments: [], created_at: '2026-01-01T00:00:00.000Z', ...p,
  } as Invoice
}
const NOW = new Date('2026-08-15T00:00:00.000Z')

describe('filterInvoicesByLeadIds', () => {
  it('keeps only invoices whose lead_id is in the set', () => {
    const list = [inv({ id: 'a', lead_id: 'L1' }), inv({ id: 'b', lead_id: 'L2' })]
    expect(filterInvoicesByLeadIds(list, ['L1']).map((i) => i.id)).toEqual(['a'])
  })
})

describe('customerAR', () => {
  it('sums invoiced/paid/outstanding over SENT invoices, excluding draft and void', () => {
    const list = [
      inv({ id: 'a', lifecycle: 'sent', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }], payments: [{ amount: 400, recorded_at: NOW.toISOString() }] }),
      inv({ id: 'b', lifecycle: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 500 }] }),
      inv({ id: 'c', lifecycle: 'void', line_items: [{ description: 'x', quantity: 1, unit_price: 900 }] }),
    ]
    const ar = customerAR(list, NOW)
    expect(ar.invoiced).toBe(1000)
    expect(ar.paid).toBe(400)
    expect(ar.outstanding).toBe(600)
  })
  it('counts an invoice past its due date as overdue and picks the earliest next-due date', () => {
    const list = [
      inv({ id: 'a', due_date: '2026-08-01', line_items: [{ description: 'x', quantity: 1, unit_price: 300 }] }), // overdue
      inv({ id: 'b', due_date: '2026-09-01', line_items: [{ description: 'x', quantity: 1, unit_price: 700 }] }), // future
    ]
    const ar = customerAR(list, NOW)
    expect(ar.overdueAmount).toBe(300)
    expect(ar.nextDueDate).toBe('2026-08-01')
    expect(ar.openCount).toBe(2)
  })
  it('does not double-count a paid deposit invoice (money comes from the ledger only)', () => {
    const list = [
      inv({ id: 'dep', type: 'deposit', line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }], payments: [{ amount: 500, recorded_at: NOW.toISOString() }] }),
    ]
    const ar = customerAR(list, NOW)
    expect(ar.paid).toBe(500)
    expect(ar.outstanding).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/crm/ar-rollup.test.ts`
Expected: FAIL — cannot resolve `@/lib/crm/ar-rollup`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Invoice } from '@/lib/types'
import { amountPaid, invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

export function filterInvoicesByLeadIds(invoices: Invoice[], leadIds: Iterable<string>): Invoice[] {
  const set = leadIds instanceof Set ? leadIds : new Set(leadIds)
  return invoices.filter((i) => i.lead_id != null && set.has(i.lead_id))
}

export interface CustomerAR {
  invoiced: number
  paid: number
  outstanding: number
  overdueAmount: number
  nextDueDate?: string
  openCount: number
}

const OVERDUE_BUCKETS = new Set(['d1_30', 'd31_60', 'd61_90', 'd90_plus'])

export function customerAR(invoices: Invoice[], now: Date): CustomerAR {
  const sent = invoices.filter((i) => i.lifecycle === 'sent')
  let invoiced = 0, paid = 0, outstanding = 0, overdueAmount = 0, openCount = 0
  let nextDueDate: string | undefined
  for (const inv of sent) {
    invoiced += invoiceAmountDue(inv)
    paid += amountPaid(inv.payments)
    const balance = invoiceBalance(inv)
    if (balance > 0) {
      outstanding += balance
      openCount += 1
      if (inv.due_date && (!nextDueDate || inv.due_date < nextDueDate)) nextDueDate = inv.due_date
      const aging = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle }, now)
      if (OVERDUE_BUCKETS.has(aging)) overdueAmount += balance
    }
  }
  return {
    invoiced: round2(invoiced), paid: round2(paid), outstanding: round2(outstanding),
    overdueAmount: round2(overdueAmount), nextDueDate, openCount,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/crm/ar-rollup.test.ts`
Expected: PASS. (If the `Invoice` factory needs more required fields, add them from `lib/types.ts` — do not change the assertions.)

- [ ] **Step 5: Commit**

```bash
git add lib/crm/ar-rollup.ts __tests__/lib/crm/ar-rollup.test.ts
git commit -m "feat(crm): pure per-customer AR aggregator + lead-id invoice filter"
```

### Task 8: Per-customer invoice fetch (lead-id fan-out)

**Files:**
- Modify: `lib/crm/invoices.ts` (add `listInvoicesByCustomerCore`)
- Test: extend `__tests__/lib/crm/ar-rollup.test.ts` is not right here — this touches Firestore, so verify via the browser walkthrough (Task 24). Add no new unit test; the pure join is already covered by `filterInvoicesByLeadIds`.

**Interfaces:**
- Consumes: `listLeadsByCustomerCore(orgId, customerId)` ([lib/crm/leads.ts](../../../lib/crm/leads.ts)), `listAllInvoicesCore(orgId)` ([lib/crm/invoices.ts](../../../lib/crm/invoices.ts)), `filterInvoicesByLeadIds` (Task 7).
- Produces: `listInvoicesByCustomerCore(orgId: string, customerId: string): Promise<Invoice[]>`

- [ ] **Step 1: Add the fetch** to `lib/crm/invoices.ts` (match the file's existing import style and `*Core` naming):

```ts
import { listLeadsByCustomerCore } from '@/lib/crm/leads'
import { filterInvoicesByLeadIds } from '@/lib/crm/ar-rollup'

/** All invoices belonging to a customer, joined by the customer's lead ids
 *  (customer_id is only conditionally stamped, so we never query it directly). */
export async function listInvoicesByCustomerCore(orgId: string, customerId: string): Promise<Invoice[]> {
  const leads = await listLeadsByCustomerCore(orgId, customerId)
  if (leads.length === 0) return []
  const all = await listAllInvoicesCore(orgId)
  return filterInvoicesByLeadIds(all, leads.map((l) => l.id))
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (no unused-import or circular-import errors — if `ar-rollup` importing from `invoices` and vice-versa creates a cycle, move `filterInvoicesByLeadIds` import to a type-only position or inline the 2-line filter here).

- [ ] **Step 3: Commit**

```bash
git add lib/crm/invoices.ts
git commit -m "feat(crm): listInvoicesByCustomerCore via lead-id fan-out"
```

---

## Phase C — Activity vocabulary & aggregation

### Task 9: Extend `ActivityEvent.kind` + timeline icons

**Files:**
- Modify: `lib/types.ts` (the `ActivityEvent.kind` union, ~line 730)
- Modify: `components/admin/opportunity/ActivityTimeline.tsx` (`KIND_ICON` map)
- Test: `__tests__/components/ui/activity-kinds.test.tsx`

**Interfaces:**
- Produces: `ActivityEvent.kind` gains `'proposal' | 'invoice' | 'deposit'`; `KIND_ICON` maps all kinds.

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from '@testing-library/react'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import type { ActivityEvent } from '@/lib/types'

it('renders proposal/invoice/deposit events without falling back to the default icon', () => {
  const events: ActivityEvent[] = (['proposal', 'invoice', 'deposit'] as const).map((kind, i) => ({
    id: String(i), parent_type: 'customer', parent_id: 'c1', kind, summary: `${kind} event`, created_at: '2026-08-15T00:00:00.000Z',
  }))
  const { getByText } = render(<ActivityTimeline orgId="o" parentType="customer" parentId="c1" activity={events} />)
  expect(getByText('proposal event')).toBeInTheDocument()
  expect(getByText('invoice event')).toBeInTheDocument()
  expect(getByText('deposit event')).toBeInTheDocument()
})
```

> This test also exercises Task 10's new `parentType`/`parentId` props — write Task 10 in the same red/green cycle if convenient, or stub the props first.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ui/activity-kinds.test.tsx`
Expected: FAIL — `'proposal'` not assignable to `ActivityEvent['kind']` (and/or props mismatch).

- [ ] **Step 3: Extend the union** in `lib/types.ts`:

```ts
// ActivityEvent.kind:
kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting' | 'converted' | 'lost' | 'nudge' | 'proposal' | 'invoice' | 'deposit'
```

- [ ] **Step 4: Add icons** in `ActivityTimeline.tsx` (import `Send`, `Receipt`, `PiggyBank` from `lucide-react`), extend `KIND_ICON`:

```ts
  proposal: Send,
  invoice: Receipt,
  deposit: PiggyBank,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/components/ui/activity-kinds.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts components/admin/opportunity/ActivityTimeline.tsx __tests__/components/ui/activity-kinds.test.tsx
git commit -m "feat(activity): add proposal/invoice/deposit event kinds + icons"
```

### Task 10: Make `ActivityTimeline` parent-agnostic

**Files:**
- Modify: `components/admin/opportunity/ActivityTimeline.tsx` (props + composer target)
- Modify: `components/admin/OpportunityDetailClient.tsx` (update the one call site)
- Test: `__tests__/components/ActivityTimeline.customer.test.tsx`

**Interfaces:**
- Produces: `ActivityTimeline({ orgId, parentType, parentId, activity })` where `parentType` ∈ `'customer'|'opportunity'`; composer calls `createNote(orgId, { parent_type: parentType, parent_id: parentId, body })`.
- Consumes (call site): `OpportunityDetailClient` passes `parentType="opportunity" parentId={lead.id}`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'

const createNote = vi.fn(async () => {})
vi.mock('@/actions/notes', () => ({ createNote: (...a: unknown[]) => createNote(...a) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

it('adds a customer note through the parent-agnostic props', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(<ActivityTimeline orgId="o" parentType="customer" parentId="c1" activity={[]} />)
  await user.click(screen.getByRole('button', { name: /add a note/i }))
  await user.type(screen.getByPlaceholderText(/add a note/i), 'Called about the wedding')
  await user.click(screen.getByRole('button', { name: /add note/i }))
  expect(createNote).toHaveBeenCalledWith('o', expect.objectContaining({ parent_type: 'customer', parent_id: 'c1', body: 'Called about the wedding' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/ActivityTimeline.customer.test.tsx`
Expected: FAIL — props typed as `leadId`, note written with hardcoded `parent_type: 'opportunity'`.

- [ ] **Step 3: Update the component.** Change the interface and the `handleAddNote` call:

```tsx
interface ActivityTimelineProps {
  orgId: string
  parentType: 'customer' | 'opportunity'
  parentId: string
  activity: ActivityEvent[]
}
// …
await createNote(orgId, { parent_type: parentType, parent_id: parentId, body: body.trim() })
```

- [ ] **Step 4: Update the call site** in `OpportunityDetailClient.tsx`: `<ActivityTimeline orgId={orgId} parentType="opportunity" parentId={lead.id} activity={activity} />`.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run __tests__/components/ActivityTimeline.customer.test.tsx __tests__/components/ui/activity-kinds.test.tsx && npm run build`
Expected: PASS (build catches any missed call site).

- [ ] **Step 6: Commit**

```bash
git add components/admin/opportunity/ActivityTimeline.tsx components/admin/OpportunityDetailClient.tsx __tests__/components/ActivityTimeline.customer.test.tsx
git commit -m "refactor(activity): make ActivityTimeline parent-agnostic (customer + opportunity)"
```

### Task 11: Customer timeline aggregation (own events + opportunities' events)

**Files:**
- Create: `lib/crm/customer-activity.ts` (pure merge)
- Test: `__tests__/lib/crm/customer-activity.test.ts`

**Interfaces:**
- Produces: `mergeActivity(lists: ActivityEvent[][]): ActivityEvent[]` — flattens, de-dupes by `id`, sorts by `created_at` desc.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mergeActivity } from '@/lib/crm/customer-activity'
import type { ActivityEvent } from '@/lib/types'

const ev = (id: string, at: string): ActivityEvent => ({ id, parent_type: 'opportunity', parent_id: 'L', kind: 'note', summary: id, created_at: at })

it('merges, de-dupes by id, and sorts newest first', () => {
  const out = mergeActivity([[ev('a', '2026-08-10T00:00:00Z'), ev('b', '2026-08-12T00:00:00Z')], [ev('b', '2026-08-12T00:00:00Z'), ev('c', '2026-08-14T00:00:00Z')]])
  expect(out.map((e) => e.id)).toEqual(['c', 'b', 'a'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/crm/customer-activity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ActivityEvent } from '@/lib/types'

export function mergeActivity(lists: ActivityEvent[][]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>()
  for (const list of lists) for (const e of list) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/crm/customer-activity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/crm/customer-activity.ts __tests__/lib/crm/customer-activity.test.ts
git commit -m "feat(crm): pure customer activity merge (own + opportunities)"
```

### Task 12: Auto-log proposal events (sent, first view, signed)

**Files:**
- Modify: `actions/proposals.ts` (`sendProposal`), `actions/proposals-public.ts` (`recordProposalView`, `signProposal`), `app/api/payments/webhook/route.ts` (signed-via-webhook path)
- Test: `__tests__/actions/proposal-activity.test.ts` (mirror the emulator-backed setup of `__tests__/actions/leads-waiting.test.ts`)

**Interfaces:**
- Consumes: `logActivity(orgId, { parent_type, parent_id, kind, summary })` ([lib/activity.ts](../../../lib/activity.ts)); each proposal has `lead_id`.
- Produces: on send → one `kind:'proposal'` event `Proposal sent — {title}`; on **first** portal view → `Proposal viewed`; on sign (either path, once) → `Proposal signed`.

- [ ] **Step 1: Write the failing test** (assert an activity event lands for the lead after each action; assert view logs only on first open). Mirror `leads-waiting.test.ts`'s emulator seed + `listActivity(orgId, 'opportunity', leadId)` assertion:

```ts
// after sendProposal(orgId, proposalId):
const events = await listActivity(orgId, 'opportunity', lead.id)
expect(events.some((e) => e.kind === 'proposal' && /sent/i.test(e.summary))).toBe(true)

// recordProposalView twice → exactly one 'viewed' proposal event
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/proposal-activity.test.ts`
Expected: FAIL — no proposal events logged.

- [ ] **Step 3: Add the `logActivity` calls.**
  - `sendProposal` (after the status→'sent' write): `await logActivity(orgId, { parent_type: 'opportunity', parent_id: proposal.lead_id, kind: 'proposal', summary: \`Proposal sent — ${proposal.title}\` })`.
  - `recordProposalView` — gate on first open: only log when `first_opened_at` was previously unset (the same signal the code already stamps). Summary `Proposal viewed`.
  - `signProposal` — replace the existing `// TODO(activity):` with `await logActivity(orgId, { parent_type: 'opportunity', parent_id: proposal.lead_id, kind: 'proposal', summary: 'Proposal signed' })`.
  - Webhook signed path (`app/api/payments/webhook/route.ts`, promotion block) — add the same call; guard so the after-accept and before-accept paths don't both fire for one signature (they're mutually exclusive — log in whichever path performs the promotion).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/actions/proposal-activity.test.ts && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/proposals.ts actions/proposals-public.ts app/api/payments/webhook/route.ts __tests__/actions/proposal-activity.test.ts
git commit -m "feat(activity): auto-log proposal sent/viewed/signed"
```

### Task 13: Auto-log money events (invoice paid, deposit paid)

**Files:**
- Modify: `actions/invoices.ts` (`recordPayment`), `app/api/payments/webhook/route.ts` (deposit idempotency block)
- Test: `__tests__/actions/invoice-activity.test.ts`

**Interfaces:**
- Produces: on the payment that transitions an invoice **to** `paid` → one `kind:'invoice'` event `Invoice paid — {amount}`; on deposit-paid (inside the webhook idempotency guard) → one `kind:'deposit'` event `Deposit paid`.

- [ ] **Step 1: Write the failing test** — record a partial payment (no event), then a payment that closes the balance (exactly one `invoice` paid event):

```ts
// partial payment: no 'invoice' paid event yet
// final payment closing the balance: exactly one kind:'invoice' event on the lead
const events = await listActivity(orgId, 'opportunity', lead.id)
expect(events.filter((e) => e.kind === 'invoice').length).toBe(1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/invoice-activity.test.ts`
Expected: FAIL — no invoice events logged.

- [ ] **Step 3: Add the calls.** In `recordPayment`, compute the payment status **before and after** applying the payment using `derivePaymentStatus` (over `invoiceAmountDue` vs `amountPaid`); log only when it transitions to `'paid'` (or `'overpaid'`). In the webhook deposit block, place the `logActivity(..., kind:'deposit', summary:'Deposit paid')` inside the existing idempotency guard so Stripe retries don't duplicate it. Use `parent_type:'opportunity'`, `parent_id: inv.lead_id` / `proposal.lead_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/actions/invoice-activity.test.ts && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts app/api/payments/webhook/route.ts __tests__/actions/invoice-activity.test.ts
git commit -m "feat(activity): auto-log invoice-paid + deposit-paid"
```

---

## Phase D — Routing & master rail

### Task 14: `clients/layout.tsx` master/detail shell

**Files:**
- Create: `app/(admin)/[orgSlug]/clients/layout.tsx`
- Modify: `app/(admin)/[orgSlug]/clients/page.tsx` (stop rendering the list; becomes the empty-state pane — Task 16 finishes it)
- Test: verified via Task 24 walkthrough (routing/layout behavior isn't unit-tested here).

**Interfaces:**
- Produces: a layout that `await`s `params`, resolves `orgId`, fetches the client list once, and renders `<ClientQueueRail … />` beside `{children}`.

- [ ] **Step 1: Create the layout** (move the `listCustomers`/`listLeads` fetch out of `page.tsx`; mirror how `[customerId]/page.tsx` resolves org + awaits params):

```tsx
import { ClientQueueRail } from '@/components/admin/clients/ClientQueueRail'
import { buildClientList } from '@/lib/crm/client-list'
import { listCustomers } from '@/actions/customers'
import { listLeads } from '@/actions/leads'
import { resolveOrgIdBySlug } from '@/lib/org-scope' // use whatever helper page.tsx currently uses

export default async function ClientsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgId = await resolveOrgIdBySlug(orgSlug)
  const [customers, leads] = await Promise.all([listCustomers(orgId), listLeads(orgId)])
  const rows = buildClientList(customers, groupLeadsByCustomer(leads)) // reuse the existing helper page.tsx used

  return (
    <div className="flex h-[calc(100vh-var(--admin-topbar,3.5rem))] min-h-0">
      <ClientQueueRail orgSlug={orgSlug} rows={rows} />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
```

> Match the real org-resolution + list-building helpers already used in the current `clients/page.tsx` (copy them verbatim from there). Keep the fetch cheap (it blocks first paint — `cacheComponents` is off).

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS once `ClientQueueRail` exists (Task 15) — if building before Task 15, stub `ClientQueueRail` to `return null`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients/layout.tsx" "app/(admin)/[orgSlug]/clients/page.tsx"
git commit -m "feat(clients): nested master/detail layout owning the list fetch"
```

### Task 15: `ClientQueueRail` — persistent searchable/filterable rail

**Files:**
- Create: `components/admin/clients/ClientQueueRail.tsx` (`'use client'`)
- Test: `__tests__/components/clients/ClientQueueRail.test.tsx`

**Interfaces:**
- Consumes: `ClientRow[]` from `buildClientList` ([lib/crm/client-list.ts](../../../lib/crm/client-list.ts)); `Avatar`, `StatusPill`.
- Produces: `ClientQueueRail({ orgSlug, rows })` — search (name/company), filter chips (All/Active/Leads/Past-due/Dormant), grouped rows, active-row highlight from `usePathname`, `<Link href={/${orgSlug}/clients/${id}}>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { ClientQueueRail } from '@/components/admin/clients/ClientQueueRail'

vi.mock('next/navigation', () => ({ usePathname: () => '/acme/clients/vega' }))
const rows = [
  { customerId: 'vega', name: 'Marisol Vega', company: 'Vega & Co.', group: 'booked_now', /* … */ },
  { customerId: 'lund', name: 'Tessa Lund', company: '', group: 'never_booked' },
] as any

it('filters the list by the search box', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(<ClientQueueRail orgSlug="acme" rows={rows} />)
  expect(screen.getByText('Marisol Vega')).toBeInTheDocument()
  await user.type(screen.getByPlaceholderText(/search clients/i), 'tessa')
  expect(screen.queryByText('Marisol Vega')).not.toBeInTheDocument()
  expect(screen.getByText('Tessa Lund')).toBeInTheDocument()
})
it('marks the row matching the current path as active', () => {
  render(<ClientQueueRail orgSlug="acme" rows={rows} />)
  expect(screen.getByRole('link', { name: /Marisol Vega/ })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/clients/ClientQueueRail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rail** — a `~304px` column: header (title + count + Add), search input, filter chips, grouped scrollable list of rows (`Avatar` + name + subtitle + right-aligned signal). Derive `selectedId` from `usePathname()` (last segment); set `aria-current="page"` on the match. Map `ClientRow.group` → filter buckets; the signal shows open balance (alert tone) when past-due, else last-touch/"New". Follow the mockup's rail. Use only tokens (`bg-sidebar`/`bg-card`/`text-muted-foreground`).

> Reference the exact `ClientRow` field names in `lib/crm/client-list.ts` (e.g. `group`, `monthsSinceLastEvent`, `rollup`) — read the file and bind to the real properties.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/clients/ClientQueueRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/clients/ClientQueueRail.tsx __tests__/components/clients/ClientQueueRail.test.tsx
git commit -m "feat(clients): persistent ClientQueueRail (search, filters, signals)"
```

### Task 16: Empty-state right pane

**Files:**
- Modify: `app/(admin)/[orgSlug]/clients/page.tsx`
- Test: none (trivial presentational; covered by walkthrough).

- [ ] **Step 1: Replace `page.tsx` body** with an `EmptyState` centered in the pane ("Select a client from the queue" / "Pick someone on the left to see their record."), using the `EmptyState` primitive. Remove the old `ClientsTable` render entirely.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients/page.tsx"
git commit -m "feat(clients): empty-state pane for the unselected cockpit"
```

---

## Phase E — The record cockpit

### Task 17: Grow the `[customerId]` loader (invoices + aggregated activity + AR)

**Files:**
- Modify: `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx`
- Test: verified via walkthrough (Firestore-backed loader).

**Interfaces:**
- Consumes: `listInvoicesByCustomerCore` (Task 8), `listActivity` ([actions/activity.ts](../../../actions/activity.ts)), `mergeActivity` (Task 11), `customerAR` (Task 7), existing `getCustomer`/`listCustomerOpportunities`/`listNotes`.
- Produces: passes `invoices`, `activity` (merged), `ar` (`CustomerAR`) into a new `ClientCockpit` (Task 18).

- [ ] **Step 1: Extend the loader.** Alongside the existing fetches add:

```tsx
const [invoices, ownActivity] = await Promise.all([
  listInvoicesByCustomerCore(orgId, customerId),
  listActivity(orgId, 'customer', customerId),
])
const leadActivity = await Promise.all(opportunities.map((l) => listActivity(orgId, 'opportunity', l.id)))
const activity = mergeActivity([ownActivity, ...leadActivity])
const ar = customerAR(invoices, new Date())
```

Render `<ClientCockpit … customer opportunities notes invoices activity ar orgId orgSlug />` (replacing `<CustomerDetailClient>`). Wrap the render in `<Suspense fallback={…}>` if the loader is split.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS (once `ClientCockpit` exists — build after Task 18, or stub it).

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients/[customerId]/page.tsx"
git commit -m "feat(clients): load invoices + aggregated activity + AR for the cockpit"
```

### Task 18: `ClientCockpit` — header + KPI band + spine

**Files:**
- Create: `components/admin/clients/ClientCockpit.tsx` (`'use client'`)
- Create: `components/admin/clients/ClientCockpitHeader.tsx`, `components/admin/clients/ClientKpiBand.tsx`
- Test: `__tests__/components/clients/ClientKpiBand.test.tsx`

**Interfaces:**
- Consumes: `Avatar`, `StatusPill`, `StatTile`, `Menu`, `ActivityTimeline` (parent-agnostic), `CustomerAR`, `rollupCustomer`, `buildClientStory` ([lib/crm/client-story.ts](../../../lib/crm/client-story.ts)).
- Produces: `ClientCockpit({ orgId, orgSlug, customer, opportunities, notes, invoices, activity, ar })` rendering the `lg:grid-cols-5` frame (spine `col-span-3`, rail `col-span-2` from Task 19).

- [ ] **Step 1: Write the failing test** for the KPI band's money sourcing (the highest-risk wiring — money must come from `ar`, not `rollup.totalWonValue`):

```tsx
import { render, screen } from '@testing-library/react'
import { ClientKpiBand } from '@/components/admin/clients/ClientKpiBand'

it('shows AR money (paid + open balance), not quoted pipeline value', () => {
  render(<ClientKpiBand ar={{ invoiced: 6000, paid: 4200, outstanding: 1800, overdueAmount: 1800, openCount: 1 }}
    rollup={{ openCount: 1, wonCount: 3, lostCount: 0, totalWonValue: 99999, openValue: 88888, lastContactAt: '2026-08-15T00:00:00Z' }} />)
  expect(screen.getByText('$4,200')).toBeInTheDocument()   // Lifetime paid = ar.paid
  expect(screen.getByText('$1,800')).toBeInTheDocument()   // Open balance = ar.outstanding
  expect(screen.queryByText('$99,999')).not.toBeInTheDocument()  // never totalWonValue
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/clients/ClientKpiBand.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Build `ClientKpiBand`** — a `grid grid-cols-4 gap-2.5 max-[1000px]:grid-cols-2` of four `StatTile`s:
  - `Lifetime paid` = `money(ar.paid)`, tone `money`.
  - `Open balance` = `money(ar.outstanding)`, tone `ar.overdueAmount > 0 ? 'alert' : 'default'`, note `ar.overdueAmount > 0 ? '⚠ past due' : 'nothing outstanding'`.
  - `Jobs` = `${rollup.wonCount} / ${rollup.wonCount + rollup.openCount + rollup.lostCount}`, note `won / total`.
  - `Last activity` = `formatRelativeTime(rollup.lastContactAt)` (or `—`).

  Then build `ClientCockpitHeader` (`Avatar` + name + `StatusPill` + subtitle + action cluster `Email · Call · New job · New proposal` + `Menu` overflow) and `ClientCockpit` composing header → KPI band → lede (`buildClientStory`) → pinned note → `<ActivityTimeline orgId parentType="customer" parentId={customer.id} activity={activity} />`, in the `lg:col-span-3` spine. Derive the status pill tone from `ClientRow.group`/`rollup` (past-due when `ar.overdueAmount > 0`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/clients/ClientKpiBand.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/clients/ClientCockpit.tsx components/admin/clients/ClientCockpitHeader.tsx components/admin/clients/ClientKpiBand.tsx __tests__/components/clients/ClientKpiBand.test.tsx
git commit -m "feat(clients): cockpit header + AR-sourced KPI band + spine"
```

### Task 19: Working rail — metadata + related cards + AR panel

**Files:**
- Create: `components/admin/clients/ClientWorkingRail.tsx`
- Test: `__tests__/components/clients/ClientWorkingRail.test.tsx`

**Interfaces:**
- Consumes: `RelatedRecordCard`, `StatusPill`, `EmptyState`, `CustomerAR`, the customer's `opportunities`/`invoices`; a click-to-edit facts block (generalize the pattern from [FactsGrid.tsx](../../../components/admin/opportunity/FactsGrid.tsx)).
- Produces: `ClientWorkingRail({ orgId, orgSlug, customer, opportunities, invoices, ar })` in the `lg:col-span-2` aside.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { ClientWorkingRail } from '@/components/admin/clients/ClientWorkingRail'

it('shows the open-balance footer on the invoices card and an empty CTA when there are none', () => {
  render(<ClientWorkingRail orgId="o" orgSlug="acme" customer={{ id: 'c1', name: 'Tessa Lund' } as any}
    opportunities={[]} invoices={[]} ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }} />)
  expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument()
  expect(screen.getByText(/create invoice/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/clients/ClientWorkingRail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the rail:**
  - **Metadata block** — click-to-edit facts (Email, Phone, Company, Source, Owner, Tags, Booking default). Read view shows value or a `+ Add {field}` affordance in `text-[var(--link)]`; clicking swaps to an input that commits via the existing customer-update action (`updateCustomer` / the action `FactsGrid`/`CustomerDetailClient` already use — reuse it, don't invent).
  - **Jobs** `RelatedRecordCard` — rows from `opportunities` (title, date/stage subtitle, `StatusPill`, `money` value); empty → "No jobs yet / Book a job".
  - **Proposals** `RelatedRecordCard` — from the customer's proposals (fan out by lead ids if not already loaded; else pass from loader); empty → "No proposals yet / Draft one".
  - **Invoices** `RelatedRecordCard` — rows from `invoices` (number, live status via `derivePaymentStatus` → `StatusPill`, balance with `alert` tone when overdue); `footer` = open-balance line (`money(ar.outstanding)`, alert when `ar.overdueAmount > 0`) + `nextDueDate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/clients/ClientWorkingRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the rail into `ClientCockpit`** as the `lg:col-span-2` aside; the whole body is `grid gap-4 lg:grid-cols-5`.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run __tests__/components/clients && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/admin/clients/ClientWorkingRail.tsx components/admin/clients/ClientCockpit.tsx __tests__/components/clients/ClientWorkingRail.test.tsx
git commit -m "feat(clients): working rail — metadata, related cards, AR panel"
```

### Task 20: Responsive collapse + delete `CustomerDetailClient`/`ClientsTable`

**Files:**
- Modify: `components/admin/clients/ClientQueueRail.tsx`, `ClientCockpit.tsx` (responsive)
- Delete: `components/admin/CustomerDetailClient.tsx`, `components/admin/ClientsTable.tsx` (once nothing imports them)
- Test: none new (walkthrough).

- [ ] **Step 1: Add responsive rules** — below the master breakpoint the queue rail goes off-canvas with a toggle in the detail header (mirror the shipped `AdminSidebar` drawer); below `lg` the working rail folds under the spine; KPI tiles wrap 2-up; hide empty context blocks on mobile.

- [ ] **Step 2: Remove the dead components.** Confirm no imports, then delete:

Run: `grep -rn "CustomerDetailClient\|ClientsTable" app components __tests__`
Expected: no references (delete/relocate any leftover tests). Then `git rm` both files.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(clients): responsive cockpit; retire CustomerDetailClient + ClientsTable"
```

---

## Phase F — Verification

### Task 21: Full test + build gate

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all green (fix regressions in migrated call sites — Families/pipeline — before proceeding).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: PASS (catches `'use server'` type re-export breakage).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test: green suite + build for client cockpit"
```

### Task 22: Browser walkthrough (mandatory)

Use the emulator walkthrough setup (see the `traxevent-emulator-walkthrough-setup` memory) and the `demo-brewtrax` seed. Drive it with the browser preview tools; capture a screenshot at the end.

- [ ] **Step 1:** Start the dev server + emulator; sign in to `demo-brewtrax`; navigate to `/{orgSlug}/clients`.
- [ ] **Step 2:** Verify the **rail**: search filters; the filter chips actually filter; avatars + signals render; grouped order (dormant-repeat first).
- [ ] **Step 3:** Click a client — the record swaps **without** a full navigation; the rail stays mounted; the URL is `/{orgSlug}/clients/{id}`; browser back returns to the queue.
- [ ] **Step 4:** Verify the **KPI band + AR panel** against seed data — Lifetime paid = real payments, Open balance = real outstanding, overdue tints alert; the invoices card footer shows the open balance + next due.
- [ ] **Step 5:** Open a **sparse** client (a fresh lead) — KPIs read `$0 / — / 0 of 0`, related cards show CTAs, metadata shows `+ Add` affordances, timeline has the lead-created event (no em-dash desert).
- [ ] **Step 6:** Add a note in the composer → it appears; confirm no console errors (`read_console_messages`).
- [ ] **Step 7:** Toggle dark mode and shrink to mobile — status pills legible, rail off-canvas, tiles wrap, no horizontal body scroll.
- [ ] **Step 8:** Screenshot the populated cockpit + the sparse cockpit; attach to the PR.

### Task 23: Self-review vs spec + open PR

- [ ] **Step 1:** Re-read the spec §11 decisions; confirm each is honored (single-contact model, real-cash tiles, overdue-event deferred, kit in `components/ui/`, read-time aggregation).
- [ ] **Step 2:** Confirm `firestore.indexes.json` needs **no** new index (the fan-out avoids a `customer_id` invoice query). If any `orderBy`+`where` you added requires one, add it and note the deploy.
- [ ] **Step 3:** Push (use the `Lifewithmo` gh account — `gh auth switch` first) and open the PR with the before/after screenshots.

```bash
gh auth switch  # to the Lifewithmo account
git push -u origin HEAD
gh pr create --title "Client Cockpit — three-pane frame, shared kit, AR + auto-activity" --body "…"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:** §4 frame → Tasks 14–20; §5 routing → 14; §6 kit (Avatar/StatTile/StatusPill/EmptyState/Menu/RelatedRecordCard) → 1–6 (Tabs + Sheet **deferred** — not used this increment, per YAGNI; noted so the doc-builder spec builds them); §7 record sections → 18–19; §8 money/AR → 7–8, 18–19; §9 activity → 9–13, 18; §10 law → enforced in 15/18/19; §12 testing → 7,9–13 (unit) + 21–22 (build/walkthrough).

**Placeholder scan:** no TBD/TODO; every code step has real code or an explicit "match the existing helper in `<file>`" instruction where a Firestore signature must be read from source.

**Type consistency:** `CustomerAR` (Task 7) is consumed unchanged in 17/18/19; `ActivityTimeline({orgId,parentType,parentId,activity})` (Task 10) is used identically in 18 and the opportunity call site; `RelatedRow`/`RelatedRecordCard` (Task 6) used in 19; `StatTile` tone values (`default|money|alert`) consistent across 2/18.

**Deferred (flagged, not silent):** `Tabs`, `Sheet` kit bricks; invoice-overdue-as-timeline-event (AR panel shows overdue live). A true Contacts-vs-Company model. All per spec §3/§11.
