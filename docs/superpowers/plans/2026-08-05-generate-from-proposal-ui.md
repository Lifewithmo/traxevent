# "Generate from Proposal" UI Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface `generateFromProposal` in the lead invoices section: a "Generate from proposal" action (proposal + type picker) alongside "New invoice", shown only when the lead has an accepted proposal.

**Architecture:** The lead page already loads proposals; filter to accepted and pass to `LeadInvoicesClient`, which adds an inline picker calling the existing (tested) `generateFromProposal` action.

**Tech Stack:** Next.js 16 (server page + client component), Vitest + @testing-library/react, TypeScript strict.

## Global Constraints
- Green gate: `npx tsc --noEmit` clean AND `npx vitest run` passing.
- No change to `generateFromProposal` or any action logic; no proposals/CRM entity edits.
- One commit. Commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: "Generate from proposal" picker in LeadInvoicesClient

**Files:**
- Modify: `components/admin/LeadInvoicesClient.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (pass `acceptedProposals`)
- Test: `__tests__/components/LeadInvoicesClient.test.tsx` (create if absent; mirror an existing component test's setup)

**Interfaces:**
- Consumes: `generateFromProposal(orgId, leadId, proposalId, { type: InvoiceType }): Promise<Invoice>` from `@/actions/invoices`; `INVOICE_TYPE_LABELS` from `@/lib/invoice-status`; `InvoiceType` from `@/lib/types`.
- Produces: `LeadInvoicesClient` gains prop `acceptedProposals: { id: string; title?: string }[]`.

- [ ] **Step 1: Write the failing component test** `__tests__/components/LeadInvoicesClient.test.tsx`. Mock `next/navigation` and `@/actions/invoices`. Mirror the render/mock pattern of an existing component test (e.g. `__tests__/components/admin/FamiliesTable.test.tsx`). Cases:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
const generateFromProposal = vi.fn()
vi.mock('@/actions/invoices', () => ({
  createInvoice: vi.fn().mockResolvedValue({ id: 'new' }),
  generateFromProposal: (...a: unknown[]) => generateFromProposal(...a),
}))

const base = { orgId: 'o', orgSlug: 's', leadId: 'l', invoices: [] as never[] }

describe('LeadInvoicesClient — generate from proposal', () => {
  it('hides the generate action when there are no accepted proposals', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[]} />)
    expect(screen.queryByRole('button', { name: /generate from proposal/i })).not.toBeInTheDocument()
  })

  it('shows it with one accepted proposal and no proposal select', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    // type select present, proposal select absent (only one)
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/proposal/i)).not.toBeInTheDocument()
  })

  it('shows a proposal select when there is more than one accepted proposal', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    expect(screen.getByLabelText(/proposal/i)).toBeInTheDocument()
  })

  it('generates with the chosen type and navigates to the new draft', async () => {
    generateFromProposal.mockResolvedValue({ id: 'inv-9' })
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'final' } })
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }))
    await waitFor(() => expect(generateFromProposal).toHaveBeenCalledWith('o', 'l', 'p1', { type: 'final' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/s/leads/l/invoices/inv-9'))
  })

  it('surfaces a generate error inline', async () => {
    generateFromProposal.mockRejectedValue(new Error('Invoice exceeds approved scope by $100.00'))
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }))
    await waitFor(() => expect(screen.getByText(/exceeds approved scope/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run __tests__/components/LeadInvoicesClient.test.tsx` → FAIL (prop/control absent).

- [ ] **Step 3: Implement `LeadInvoicesClient.tsx`.**
  - Extend props: `acceptedProposals: { id: string; title?: string }[]`.
  - Imports: add `generateFromProposal` to the `@/actions/invoices` import; `INVOICE_TYPE_LABELS` from `@/lib/invoice-status`; `InvoiceType` from `@/lib/types`.
  - State: `const [showGen, setShowGen] = useState(false)`, `const [genProposalId, setGenProposalId] = useState(acceptedProposals[0]?.id ?? '')`, `const [genType, setGenType] = useState<InvoiceType>('deposit')`, `const [generating, setGenerating] = useState(false)`.
  - In the `CardHeader`, next to "New invoice", render (only when `acceptedProposals.length > 0`) a `Button variant="outline"` labeled "Generate from proposal" that toggles `showGen`.
  - Below the error line, when `showGen`, render an inline panel:
    - If `acceptedProposals.length > 1`: a labeled `<select id="genProposal">` (label "Proposal") bound to `genProposalId`, options `acceptedProposals.map(p => <option value={p.id}>{p.title || 'Proposal'}</option>)`.
    - A labeled `<select id="genType">` (label "Type") bound to `genType`, options `(['deposit','progress','final','quick'] as InvoiceType[]).map(t => <option value={t}>{INVOICE_TYPE_LABELS[t]}</option>)`.
    - A `Button` labeled "Generate" (disabled while `generating`) calling `handleGenerate`, and a "Cancel" `Button variant="ghost"` that sets `showGen=false`.
    - Use native `<select>` styled like the app's other selects; add proper `<label htmlFor>` for accessibility (the tests query by label).
  - `handleGenerate`:
    ```ts
    async function handleGenerate() {
      setGenerating(true); setError(null)
      try {
        const created = await generateFromProposal(orgId, leadId, genProposalId, { type: genType })
        router.push(`/${orgSlug}/leads/${leadId}/invoices/${created.id}`)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to generate invoice')
        setGenerating(false)
      }
    }
    ```
  - Keep all existing behavior (New invoice, list, copy link, edit) intact.

- [ ] **Step 4: Wire the page** `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`:
  - After `proposals` is loaded, compute `const acceptedProposals = proposals.filter((p) => p.status === 'accepted').map((p) => ({ id: p.id, title: p.title }))`.
  - Pass `acceptedProposals={acceptedProposals}` to `<LeadInvoicesClient ... />`. No other page change.

- [ ] **Step 5: Run tests + full suite + typecheck** — `npx vitest run __tests__/components/LeadInvoicesClient.test.tsx && npx vitest run && npx tsc --noEmit` → all PASS + clean.

- [ ] **Step 6: Commit** —
```bash
git add components/admin/LeadInvoicesClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" __tests__/components/LeadInvoicesClient.test.tsx
git commit -m "feat(invoicing): Generate-from-proposal action in the lead invoices section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- **Spec coverage:** page passes accepted proposals (Step 4); button gated on acceptedProposals (Step 3 + test 1); proposal select only when >1 (test 2/3); generate + navigate (test 4); inline error (test 5). ✓
- **Placeholders:** concrete code for handler/state; the JSX panel is described field-by-field with the exact option values/labels and accessibility labels the tests query.
- **Type consistency:** `generateFromProposal(orgId, leadId, proposalId, { type: InvoiceType })` matches the action; `genType: InvoiceType`; `INVOICE_TYPE_LABELS[t]` keyed by `InvoiceType`.
- **Isolation:** reads proposals (already loaded) + calls an existing action; no proposals/CRM entity edits.
