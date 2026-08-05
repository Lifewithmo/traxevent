# Invoice ↔ Customer Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Populate `Invoice.customer_id` from the lead's linked `Customer` at creation, and show "Bill to: {name}" in the admin invoice editor.

**Architecture:** `createInvoice` is the single creation primitive; it reads the lead via `getLead` and copies `lead.customer_id`. The editor page resolves the customer name via `getCustomer` and passes it to the client component for display. No backfill; store id only.

**Tech Stack:** Next.js 16 App Router (server actions + server component page), Firestore (firebase-admin), Vitest + @testing-library/react, TypeScript strict.

## Global Constraints

- Green gate (every task): `npx tsc --noEmit` clean AND `npx vitest run` passing.
- Read-only on CRM code: call `getLead`/`getCustomer` only; never modify `actions/leads.ts`, `actions/customers.ts`, or any CRM entity.
- `customer_id` is derived from the lead, never written as `undefined` (conditional spread).
- No backfill of existing invoices; no name denormalization.
- One commit per task. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Populate `customer_id` from the lead in `createInvoice`

**Files:**
- Modify: `actions/invoices.ts` (`createInvoice`)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `getLead(orgId, leadId): Promise<Lead | null>` from `@/actions/leads`; existing `createInvoice(orgId, leadId, input)` and `generateFromProposal`.
- Produces: `createInvoice` now sets `customer_id` on the created invoice when the lead has one. No signature change.

- [ ] **Step 1: Add failing tests** to `__tests__/actions/invoices.test.ts`. Add a `getLead` mock alongside the existing mocks:

```ts
const getLeadSpy = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ getLead: getLeadSpy }))
```

Tests (reuse the file's real invoice-doc `set` spy name in place of `invoiceDocSetSpy`):

```ts
it('createInvoice copies customer_id from the lead when the lead has one', async () => {
  getLeadSpy.mockResolvedValue({ id: 'lead-1', name: 'Acme', stage: 'booked', customer_id: 'cust-9', created_at: '' })
  const inv = await createInvoice('org-1', 'lead-1', {})
  expect(inv.customer_id).toBe('cust-9')
  const written = invoiceDocSetSpy.mock.calls.at(-1)![0]
  expect(written.customer_id).toBe('cust-9')
})

it('createInvoice omits customer_id when the lead has none (no undefined written)', async () => {
  getLeadSpy.mockResolvedValue({ id: 'lead-1', name: 'Acme', stage: 'booked', created_at: '' })
  const inv = await createInvoice('org-1', 'lead-1', {})
  expect(inv.customer_id).toBeUndefined()
  const written = invoiceDocSetSpy.mock.calls.at(-1)![0]
  expect('customer_id' in written).toBe(false)
})

it('createInvoice omits customer_id when the lead is missing', async () => {
  getLeadSpy.mockResolvedValue(null)
  const inv = await createInvoice('org-1', 'lead-1', {})
  expect(inv.customer_id).toBeUndefined()
})

it('generateFromProposal inherits the lead customer_id', async () => {
  getLeadSpy.mockResolvedValue({ id: 'lead-1', name: 'Acme', stage: 'booked', customer_id: 'cust-9', created_at: '' })
  getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
    line_items: [{ description: 'Pkg', quantity: 1, unit_price: 1000 }], created_at: '' })
  listInvoicesSpy.mockResolvedValue({ docs: [] })
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })
  expect(inv.customer_id).toBe('cust-9')
})
```

Note: existing `createInvoice` tests that call it without a `getLead` mock will now hit `getLead` — add `beforeEach(() => getLeadSpy.mockResolvedValue(null))` (or set it per-test) so they still pass. Confirm the existing `generateFromProposal` tests still pass (add a default `getLeadSpy` return in `beforeEach`).

- [ ] **Step 2: Run to verify new tests fail**

Run: `npx vitest run __tests__/actions/invoices.test.ts -t customer_id`
Expected: FAIL — `customer_id` not populated (and `getLead` not called).

- [ ] **Step 3: Implement** in `actions/invoices.ts`. Add import `import { getLead } from '@/actions/leads'`. In `createInvoice`, before building the invoice object, read the lead and copy its `customer_id`:

```ts
export async function createInvoice(orgId: string, leadId: string, input: CreateInvoiceInput): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const lead = await getLead(orgId, leadId)
  const id = randomBytes(8).toString('hex')
  const invoice: Invoice = {
    id, org_id: orgId, lead_id: leadId, token: generateAccessToken(),
    schema_version: 2,
    type: input.type ?? 'quick',
    lifecycle: 'draft',
    delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
    line_items: input.line_items ?? [],
    payments: [],
    created_at: new Date().toISOString(),
    ...(lead?.customer_id ? { customer_id: lead.customer_id } : {}),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.number?.trim() ? { number: input.number.trim() } : {}),
    ...(input.due_date?.trim() ? { due_date: input.due_date.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await invoicesRef(orgId).doc(id).set(invoice)
  return invoice
}
```

(Keep the rest of `createInvoice` unchanged. `getLead` calls `assertOrgMember` internally — the double auth check is idempotent, consistent with existing patterns.)

- [ ] **Step 4: Run action tests + full suite + typecheck**

Run: `npx vitest run __tests__/actions/invoices.test.ts && npx vitest run && npx tsc --noEmit`
Expected: action tests PASS, full suite PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts __tests__/actions/invoices.test.ts
git commit -m "feat(invoicing): populate invoice customer_id from the linked lead on create

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: "Bill to: {customer}" in the admin invoice editor

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx` (resolve customer, pass `customerName`)
- Modify: `components/admin/InvoiceEditorClient.tsx` (render "Bill to")
- Test: `__tests__/components/InvoiceEditorClient.test.tsx`

**Interfaces:**
- Consumes: `getCustomer(orgId, customerId): Promise<Customer | null>` from `@/actions/customers`; `NormalizedInvoice.customer_id`.
- Produces: `InvoiceEditorClient` accepts a new optional prop `customerName?: string` and renders a "Bill to" line when it is set.

- [ ] **Step 1: Write the failing component test.** Read the existing `__tests__/components/InvoiceEditorClient.test.tsx` for the render/mock setup and add:

```tsx
it('shows "Bill to" with the customer name when provided', () => {
  render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" customerName="Acme Corp" invoice={inv({ customer_id: 'cust-9' })} />)
  expect(screen.getByText(/bill to/i)).toBeInTheDocument()
  expect(screen.getByText(/acme corp/i)).toBeInTheDocument()
})

it('renders no "Bill to" line when customerName is absent', () => {
  render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" invoice={inv({})} />)
  expect(screen.queryByText(/bill to/i)).not.toBeInTheDocument()
})
```

(Use the file's existing `inv(...)` helper — extend it if needed so `customer_id` can be set.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx -t "Bill to"`
Expected: FAIL — prop/line not implemented.

- [ ] **Step 3: Implement.** In `InvoiceEditorClient.tsx`, add `customerName?: string` to the props interface and render a line near the header when it is set, e.g.:

```tsx
{customerName && (
  <p className="text-sm text-muted-foreground">Bill to: <span className="font-medium text-foreground">{customerName}</span></p>
)}
```

In the editor page, after loading the invoice (via `getInvoice`, which returns a `NormalizedInvoice` with `customer_id`), resolve the customer and pass the name. READ the page first to match its existing data-loading and prop-passing style; then:

```tsx
import { getCustomer } from '@/actions/customers'
// ...after fetching `invoice`:
const customer = invoice.customer_id ? await getCustomer(orgId, invoice.customer_id) : null
// pass to the client component:
// <InvoiceEditorClient ... customerName={customer?.name} />
```

- [ ] **Step 4: Run component test + full suite + typecheck**

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx && npx vitest run && npx tsc --noEmit`
Expected: component test PASS, full suite PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx" components/admin/InvoiceEditorClient.tsx __tests__/components/InvoiceEditorClient.test.tsx
git commit -m "feat(invoicing): show Bill to customer in the invoice editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** populate in createInvoice (Task 1) ✓; generateFromProposal inherits (Task 1 test) ✓; no-backfill/no-denormalization (no task touches existing invoices or stores name) ✓; admin "Bill to" display (Task 2) ✓; tests for all four spec cases ✓.
- **Placeholder scan:** no TBD/TODO; all steps have concrete code except Task 2 Step 3's page edit, which is described concretely with the exact imports/calls (the page's exact prop-passing line is read-then-match, since its current shape must be read first).
- **Type consistency:** `getLead`/`getCustomer` signatures match their real exports; `customerName?: string` prop consistent between Task 2 test and implementation; `customer_id` is the existing `Invoice`/`NormalizedInvoice` field.
- **Isolation:** only reads CRM code (`getLead`, `getCustomer`); no CRM writes.
