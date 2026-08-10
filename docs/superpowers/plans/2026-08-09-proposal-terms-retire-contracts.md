# Proposal Terms + Contracts Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The proposal gains a legal-terms section covered by the existing hash-pinned e-signature, and the standalone contracts feature is removed end to end.

**Architecture:** Stage 1 (Tasks 1–6) is additive: `Proposal.terms` flows org-default → draft prefill → builder RightRail → public/print render, and joins the canonical signed document *only when present* so every legacy signed hash is unchanged. Stage 2 (Tasks 7–9) is subtractive: the convert gate, attachment chips, client portal, sidebar, and industry packs stop referencing contracts, then the contracts routes/components/actions/lib/types/tests are deleted. Task 10 runs the repo gates and updates the roadmap.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing route/page code — this Next version has breaking changes), Firestore via `firebase-admin`, Vitest + Testing Library, plain server actions (`'use server'`).

**Spec:** `docs/superpowers/specs/2026-08-09-proposal-terms-contracts-retirement-design.md`

## Global Constraints

- Terms cap is **10,000 characters**, defined once as `MAX_TERMS_CHARS` in `lib/proposals/draft.ts`. `'use server'` modules (everything in `actions/`) may only export async functions — never export constants or re-export types from them; import the constant from lib.
- The golden fixtures in `__tests__/lib/proposal-signature-goldens.test.ts` must pass **unmodified**. Never regenerate or edit them to make a failure pass — a golden failure means your hash change broke legacy signed documents.
- `terms` joins `canonicalProposalDocument` via conditional spread (present-only), never as `terms: x ?? null` — a `null` key would change every legacy hash.
- Firestore rejects `undefined` values: optional fields are written with conditional spreads, cleared with `FieldValue.delete()`.
- Full-suite test command from the primary checkout: `npx vitest run --exclude '**/.claude/**'` (the exclude keeps stale `.claude/worktrees` copies out). Single-file runs need no exclude.
- If executing in a fresh worktree: run `npm install` first, and copy `.env.local` from the primary checkout or `next build` will fail.
- Branch: `claude/proposal-terms-retire-contracts` (already created off main). Commit after every task. Pushing requires `gh auth switch` to the Lifewithmo account.
- Final gates before calling the branch green: full vitest run **and** `npx next build` (catches `'use server'` violations tsc misses).

---

### Task 1: `terms` on the Proposal type and in the signed document hash

**Files:**
- Modify: `lib/types.ts` (Proposal interface, ~line 538)
- Modify: `lib/proposal-signature.ts`
- Test: `__tests__/lib/proposal-signature.test.ts`

**Interfaces:**
- Consumes: existing `canonicalProposalDocument(proposal, selection)`, `documentHash(canonical)` from `lib/proposal-signature.ts`.
- Produces: `Proposal.terms?: string` (plain-text legal terms; absent on all pre-existing proposals). `canonicalProposalDocument` output contains a `"terms"` key iff `proposal.terms !== undefined`.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/proposal-signature.test.ts` (match the file's existing fixture style — it already builds minimal proposal/selection literals):

```ts
describe('terms in the signed document', () => {
  const selection = { package_id: undefined, optional_item_ids: [], selected_total: 100 }
  const base = {
    title: 'Coffee cart',
    notes: undefined,
    packages: [],
    line_items: [],
    discount: undefined,
    tax_rate: undefined,
    deposit: undefined,
    deposit_terms: undefined,
  }

  it('is absent from the canonical document when the proposal has no terms', () => {
    const canonical = canonicalProposalDocument(base, selection)
    expect(canonical).not.toContain('"terms"')
  })

  it('changes the document hash when present', () => {
    const without = canonicalProposalDocument(base, selection)
    const withTerms = canonicalProposalDocument(
      { ...base, terms: 'Deposit is non-refundable within 30 days of the event.' },
      selection,
    )
    expect(withTerms).toContain('"terms":"Deposit is non-refundable within 30 days of the event."')
    expect(documentHash(withTerms)).not.toBe(documentHash(without))
  })
})
```

If the file imports only `signedDocumentHash`, extend the import to `{ canonicalProposalDocument, documentHash, signedDocumentHash }`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run __tests__/lib/proposal-signature.test.ts`
Expected: the two new tests FAIL — TypeScript may also flag `terms` as an unknown property (that is the point).

- [ ] **Step 3: Add the field to the type**

In `lib/types.ts`, inside `interface Proposal`, directly under `deposit_terms?: string`:

```ts
  terms?: string               // legal terms; snapshot from Org.default_proposal_terms at creation, editable per proposal; participates in the signed document hash when present
```

- [ ] **Step 4: Include terms in the canonical document**

In `lib/proposal-signature.ts`:

1. Extend the pick list:

```ts
type SignableProposal = Pick<Proposal, 'title' | 'notes' | 'packages' | 'line_items' | 'discount' | 'tax_rate' | 'deposit' | 'deposit_terms' | 'terms'>
```

2. In `canonicalProposalDocument`, add to the `doc` literal (position is irrelevant — `canonicalize` sorts keys — but keep it next to `deposit_terms`):

```ts
    ...(proposal.terms !== undefined ? { terms: proposal.terms } : {}),
```

Do NOT write `terms: proposal.terms ?? null` — that changes every legacy hash.

- [ ] **Step 5: Run signature tests AND goldens**

Run: `npx vitest run __tests__/lib/proposal-signature.test.ts __tests__/lib/proposal-signature-goldens.test.ts`
Expected: ALL PASS. A golden failure means Step 4 was done wrong (unconditional key) — fix the implementation, never the fixtures.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposal-signature.ts __tests__/lib/proposal-signature.test.ts
git commit -m "feat(proposals): terms field participates in signed document hash when present"
```

---

### Task 2: terms through the draft autosave pipeline

**Files:**
- Modify: `lib/proposals/draft.ts`
- Modify: `lib/proposals/draft-core.ts` (CLEARABLE_FIELDS)
- Test: `__tests__/lib/proposal-draft-normalize.test.ts`

**Interfaces:**
- Consumes: `Proposal.terms` from Task 1.
- Produces: `MAX_TERMS_CHARS = 10_000` exported from `lib/proposals/draft.ts`; `terms?: string` on `ProposalDraftUpdate`, `ProposalDraftInput`, and `NormalizedProposalDraft`; `normalizeProposalDraft` trims and caps terms (with an adjustment message when capped); `draftFromProposal` round-trips it; `updateProposalDraftCore` clears the stored field when the key is absent (full-state semantics).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/proposal-draft-normalize.test.ts` (follow the file's existing call style for `normalizeProposalDraft`):

```ts
describe('terms', () => {
  it('trims and stores terms', () => {
    const { draft, adjustments } = normalizeProposalDraft({ terms: '  No refunds within 30 days.  ' })
    expect(draft.terms).toBe('No refunds within 30 days.')
    expect(adjustments).toEqual([])
  })

  it('omits empty terms', () => {
    const { draft } = normalizeProposalDraft({ terms: '   ' })
    expect(draft.terms).toBeUndefined()
    expect(Object.keys(draft)).not.toContain('terms')
  })

  it('caps terms at MAX_TERMS_CHARS with an adjustment', () => {
    const { draft, adjustments } = normalizeProposalDraft({ terms: 'x'.repeat(MAX_TERMS_CHARS + 5) })
    expect(draft.terms).toHaveLength(MAX_TERMS_CHARS)
    expect(adjustments).toContain(`Shortened the terms to ${MAX_TERMS_CHARS} characters.`)
  })

  it('round-trips through draftFromProposal', () => {
    const p = { terms: 'Balance due 7 days before the event.' } as Proposal
    expect(draftFromProposal(p).terms).toBe('Balance due 7 days before the event.')
  })
})
```

Extend the file's imports with `MAX_TERMS_CHARS`, `draftFromProposal`, and the `Proposal` type as needed.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/proposal-draft-normalize.test.ts`
Expected: FAIL — `MAX_TERMS_CHARS` not exported, `terms` unknown.

- [ ] **Step 3: Implement in `lib/proposals/draft.ts`**

1. Next to `MAX_PACKAGES`:

```ts
// Shared cap for proposal terms AND the org default they're seeded from.
// Lives here (not in actions/) because 'use server' modules cannot export constants.
export const MAX_TERMS_CHARS = 10_000
```

2. Add `terms?: string` to all three shapes — `ProposalDraftUpdate` (after `deposit_terms`), `ProposalDraftInput` (after `deposit_terms`), `NormalizedProposalDraft` (after `deposit_terms`).

3. In `draftFromProposal`, with the other field copies:

```ts
  if (p.terms !== undefined) draft.terms = p.terms
```

4. In `normalizeProposalDraft`, next to the `deposit_terms` handling:

```ts
  let terms = str(input.terms).trim()
  if (terms.length > MAX_TERMS_CHARS) {
    terms = terms.slice(0, MAX_TERMS_CHARS)
    adjustments.push(`Shortened the terms to ${MAX_TERMS_CHARS} characters.`)
  }
```

and in the returned draft literal, next to `deposit_terms`:

```ts
      ...(terms ? { terms } : {}),
```

- [ ] **Step 4: Add to CLEARABLE_FIELDS in `lib/proposals/draft-core.ts`**

```ts
const CLEARABLE_FIELDS = [
  'title',
  'notes',
  'packages',
  'discount',
  'tax_rate',
  'deposit',
  'expires_at',
  'deposit_gate',
  'deposit_terms',
  'terms',
] as const
```

(The builder autosaves full state — an absent `terms` key means the user cleared it, and `updateProposalDraftCore` already turns absent clearable fields into `FieldValue.delete()`.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/lib/proposal-draft-normalize.test.ts __tests__/lib/proposals.test.ts`
Expected: PASS (the proposals lib test guards nothing terms-related yet but must not regress).

- [ ] **Step 6: Commit**

```bash
git add lib/proposals/draft.ts lib/proposals/draft-core.ts __tests__/lib/proposal-draft-normalize.test.ts
git commit -m "feat(proposals): terms flows through draft normalize/autosave with 10k cap"
```

---

### Task 3: org default terms + prefill on proposal creation

**Files:**
- Modify: `lib/types.ts` (Org interface, ~line 26)
- Modify: `actions/orgs.ts`
- Modify: `actions/proposals.ts` (`createProposal`)
- Test: `__tests__/actions/orgs.test.ts`, `__tests__/actions/proposals.test.ts`

**Interfaces:**
- Consumes: `MAX_TERMS_CHARS` from `lib/proposals/draft.ts` (Task 2).
- Produces: `Org.default_proposal_terms?: string`; `updateOrgDefaultProposalTerms(orgId: string, terms: string): Promise<string>` (returns what was stored, `''` when cleared); `createProposal` seeds `proposal.terms` from the org default (snapshot copy — later edits to the default never touch existing proposals).

- [ ] **Step 1: Add the Org field**

In `lib/types.ts`, inside `interface Org`, under `intake_token`:

```ts
  default_proposal_terms?: string    // seeded into new proposals' `terms` (snapshot, not a live reference)
```

- [ ] **Step 2: Write the failing action test for the org default**

Append to `__tests__/actions/orgs.test.ts`, reusing that file's existing `adminDb` mock (it already mocks org doc `update`; if its org doc mock lacks an `update` spy, add one following the file's hoisted-spy pattern):

```ts
describe('updateOrgDefaultProposalTerms', () => {
  it('trims and stores terms, returning what was stored', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', '  Balance due 7 days out.  ')
    expect(stored).toBe('Balance due 7 days out.')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ default_proposal_terms: 'Balance due 7 days out.' })
  })

  it('clears the field when given blank input', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', '   ')
    expect(stored).toBe('')
    const arg = orgDocUpdateSpy.mock.calls.at(-1)![0]
    expect(JSON.stringify(arg.default_proposal_terms)).toBe(JSON.stringify(FieldValue.delete()))
  })

  it('caps at MAX_TERMS_CHARS', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', 'x'.repeat(MAX_TERMS_CHARS + 1))
    expect(stored).toHaveLength(MAX_TERMS_CHARS)
  })
})
```

(If the file does not already mock `firebase-admin/firestore`, add `vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: vi.fn(() => '__DELETE__') } }))` and assert against `'__DELETE__'` instead — copy whichever pattern `__tests__/actions/` already uses for `FieldValue`; `grep -rn "FieldValue" __tests__/actions/ | head` shows the house style.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run __tests__/actions/orgs.test.ts`
Expected: FAIL — `updateOrgDefaultProposalTerms` does not exist.

- [ ] **Step 4: Implement the action in `actions/orgs.ts`**

Add imports:

```ts
import { FieldValue } from 'firebase-admin/firestore'
import { MAX_TERMS_CHARS } from '@/lib/proposals/draft'
```

Add the action:

```ts
/**
 * The org's standard proposal terms — copied into each NEW proposal's `terms`
 * at creation (a snapshot: editing this never mutates existing proposals).
 * Blank input clears the field.
 */
export async function updateOrgDefaultProposalTerms(orgId: string, terms: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const trimmed = (typeof terms === 'string' ? terms : '').trim().slice(0, MAX_TERMS_CHARS)
  await adminDb.collection('orgs').doc(orgId).update({
    default_proposal_terms: trimmed || FieldValue.delete(),
  })
  return trimmed
}
```

- [ ] **Step 5: Run org tests**

Run: `npx vitest run __tests__/actions/orgs.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing prefill test**

In `__tests__/actions/proposals.test.ts`, the existing `adminDb` mock's `orgDoc` object (the thing returned by `collection('orgs').doc(...)`) has only a `collection` method. Add a hoisted `orgDocGetSpy`:

```ts
const orgDocGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }))
```

and inside the mock factory give `orgDoc` a `get: orgDocGetSpy`. Then add tests:

```ts
describe('createProposal terms prefill', () => {
  it('copies the org default into the new proposal', async () => {
    orgDocGetSpy.mockResolvedValueOnce({ exists: true, data: () => ({ default_proposal_terms: 'No refunds within 30 days.' }) })
    await createProposal('org-1', 'lead-1', {})
    const written = proposalDocSetSpy.mock.calls.at(-1)![0]
    expect(written.terms).toBe('No refunds within 30 days.')
  })

  it('writes no terms key when the org has no default', async () => {
    orgDocGetSpy.mockResolvedValueOnce({ exists: true, data: () => ({}) })
    await createProposal('org-1', 'lead-1', {})
    const written = proposalDocSetSpy.mock.calls.at(-1)![0]
    expect(Object.keys(written)).not.toContain('terms')
  })
})
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run __tests__/actions/proposals.test.ts`
Expected: the two new tests FAIL (no org read happens; `terms` never written).

- [ ] **Step 8: Implement the prefill in `actions/proposals.ts`**

In `createProposal`, after `await assertOrgAdmin(orgId)`:

```ts
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const defaultTerms = (((orgSnap.data() as Org | undefined)?.default_proposal_terms) ?? '').trim()
```

and in the `proposal` literal, after the `deposit_terms` spread:

```ts
    ...(defaultTerms ? { terms: defaultTerms } : {}),
```

Extend the type-only import: `import type { Org, Proposal, ... } from '@/lib/types'`.

- [ ] **Step 9: Run tests**

Run: `npx vitest run __tests__/actions/proposals.test.ts`
Expected: PASS — including all pre-existing createProposal tests (the default `orgDocGetSpy` resolves an empty org, so they see no behavior change).

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts actions/orgs.ts actions/proposals.ts __tests__/actions/orgs.test.ts __tests__/actions/proposals.test.ts
git commit -m "feat(proposals): org default terms seed new proposals at creation"
```

---

### Task 4: org settings UI for default terms (branding page)

**Files:**
- Modify: `app/(admin)/[orgSlug]/branding/page.tsx`
- Modify: `components/admin/BrandingClient.tsx`
- Test: `__tests__/components/admin/BrandingClient-terms.test.tsx` (create)

**Interfaces:**
- Consumes: `updateOrgDefaultProposalTerms` (Task 3).
- Produces: `BrandingClientProps` gains `initialDefaultTerms: string`.

- [ ] **Step 1: Write the failing component test**

Create `__tests__/components/admin/BrandingClient-terms.test.tsx` (mirror the render/mocking style of neighboring tests in `__tests__/components/admin/`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrandingClient } from '@/components/admin/BrandingClient'

const updateTermsSpy = vi.hoisted(() => vi.fn().mockResolvedValue('Stored terms.'))
vi.mock('@/actions/orgs', () => ({
  updateOrgBranding: vi.fn(),
  updateOrgDefaultProposalTerms: updateTermsSpy,
}))
vi.mock('@/actions/org-assets', () => ({ uploadOrgAsset: vi.fn() }))

describe('BrandingClient proposal terms', () => {
  it('edits and saves the org default terms', async () => {
    render(<BrandingClient orgId="org-1" orgName="Acme" initialBranding={{}} initialDefaultTerms="Old terms." />)
    const box = screen.getByLabelText('Proposal terms')
    expect(box).toHaveValue('Old terms.')
    fireEvent.change(box, { target: { value: 'New terms.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save terms' }))
    await waitFor(() => expect(updateTermsSpy).toHaveBeenCalledWith('org-1', 'New terms.'))
    // Re-seeds from the server's normalized truth
    await waitFor(() => expect(box).toHaveValue('Stored terms.'))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/admin/BrandingClient-terms.test.tsx`
Expected: FAIL — unknown prop / missing textarea.

- [ ] **Step 3: Implement**

In `components/admin/BrandingClient.tsx`:

1. Import the action: `import { updateOrgBranding, updateOrgDefaultProposalTerms } from '@/actions/orgs'`.
2. Add `initialDefaultTerms: string` to `BrandingClientProps` and the destructured props.
3. Add state + handler inside the component:

```tsx
  const [defaultTerms, setDefaultTerms] = useState(initialDefaultTerms)
  const [termsBusy, setTermsBusy] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [termsNotice, setTermsNotice] = useState<string | null>(null)

  async function handleSaveTerms() {
    setTermsBusy(true)
    setTermsError(null)
    setTermsNotice(null)
    try {
      const saved = await updateOrgDefaultProposalTerms(orgId, defaultTerms)
      setDefaultTerms(saved)
      setTermsNotice('Saved')
    } catch (err: unknown) {
      setTermsError(err instanceof Error ? err.message : 'Failed to save terms')
    } finally {
      setTermsBusy(false)
    }
  }
```

4. Add a second card after the Brand kit card (inside the same outer `div`):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Proposal terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="branding-default-terms">Proposal terms</Label>
            <textarea
              id="branding-default-terms"
              value={defaultTerms}
              onChange={(e) => setDefaultTerms(e.target.value)}
              placeholder="e.g. A 50% deposit reserves your date. Balance is due 7 days before the event…"
              className="flex min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-gray-500">
              Included on every new proposal. Editable per proposal; changing this never alters existing proposals.
            </p>
          </div>
          {termsError && <p className="text-sm text-red-600">{termsError}</p>}
          {termsNotice && <p className="text-sm text-green-700">{termsNotice}</p>}
          <Button onClick={handleSaveTerms} disabled={termsBusy}>
            {termsBusy ? 'Saving…' : 'Save terms'}
          </Button>
        </CardContent>
      </Card>
```

5. In `app/(admin)/[orgSlug]/branding/page.tsx`, pass the new prop:

```tsx
  return (
    <BrandingClient
      orgId={org.id}
      orgName={org.name}
      initialBranding={org.branding ?? {}}
      initialDefaultTerms={org.default_proposal_terms ?? ''}
    />
  )
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run __tests__/components/admin/BrandingClient-terms.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/BrandingClient.tsx 'app/(admin)/[orgSlug]/branding/page.tsx' __tests__/components/admin/BrandingClient-terms.test.tsx
git commit -m "feat(branding): org default proposal terms editor"
```

---

### Task 5: terms editor in the builder RightRail

**Files:**
- Modify: `components/admin/proposal-builder/RightRail.tsx`
- Test: `__tests__/components/admin/RightRail-terms.test.tsx` (create)

**Interfaces:**
- Consumes: `ProposalDraftUpdate.terms` (Task 2); RightRail's existing `draft`/`update`/`locked` props.
- Produces: a fixed "Terms" textarea in the rail — terms are deliberately NOT a layout block (blocks are excluded from the signature hash and are movable/deletable).

- [ ] **Step 1: Write the failing component test**

Create `__tests__/components/admin/RightRail-terms.test.tsx`. RightRail takes many props; build a minimal harness (mock the AI panel — it's irrelevant here):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RightRail } from '@/components/admin/proposal-builder/RightRail'
import type { Proposal } from '@/lib/types'

vi.mock('@/components/admin/proposal-builder/ProposalAiPanel', () => ({
  ProposalAiPanel: () => null,
}))

const proposal = {
  id: 'p1', org_id: 'o1', lead_id: 'l1', token: 't', status: 'draft',
  line_items: [], created_at: '2026-08-09T00:00:00.000Z',
} as Proposal

function renderRail(extra: { locked?: boolean; terms?: string; update?: (p: object) => void } = {}) {
  const update = extra.update ?? vi.fn()
  render(
    <RightRail
      proposal={proposal}
      status="draft"
      locked={extra.locked ?? false}
      draft={{ terms: extra.terms }}
      update={update}
      saveStatus="saved"
      adjustments={[]}
      retryNow={() => {}}
      placeholderCount={0}
      aiEnabled={false}
      busy={false}
      error={null}
      onSend={() => {}}
      onVoid={() => {}}
      onDelete={() => {}}
      onAiApply={() => {}}
    />,
  )
  return update
}

describe('RightRail terms', () => {
  it('edits terms through the autosave update callback', () => {
    const update = renderRail({ terms: 'Old.' })
    const box = screen.getByLabelText('Terms')
    expect(box).toHaveValue('Old.')
    fireEvent.change(box, { target: { value: 'New terms.' } })
    expect(update).toHaveBeenCalledWith({ terms: 'New terms.' })
  })

  it('clears terms as undefined (full-state autosave semantics)', () => {
    const update = renderRail({ terms: 'Old.' })
    fireEvent.change(screen.getByLabelText('Terms'), { target: { value: '' } })
    expect(update).toHaveBeenCalledWith({ terms: undefined })
  })

  it('disables the textarea when locked', () => {
    renderRail({ locked: true, terms: 'Old.' })
    expect(screen.getByLabelText('Terms')).toBeDisabled()
  })
})
```

If RightRail's real prop list differs from the above (check the component — it is the source of truth), adjust the harness props to satisfy it; do not change the three assertions.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/admin/RightRail-terms.test.tsx`
Expected: FAIL — no "Terms" field exists.

- [ ] **Step 3: Implement**

In `components/admin/proposal-builder/RightRail.tsx`, after the deposit block (the `{deposit && (...)}` section ending near line 241) and before the "Expires" field, add — OUTSIDE the `deposit &&` conditional, since terms apply with or without a deposit:

```tsx
        <div className="space-y-1">
          <Label htmlFor="propTerms">Terms</Label>
          <textarea
            id="propTerms"
            value={draft.terms ?? ''}
            onChange={(e) => update({ terms: e.target.value || undefined })}
            placeholder="Legal terms the client agrees to when signing. Seeded from Branding → Proposal terms."
            disabled={locked}
            className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Shown above the signature box; covered by the client&apos;s e-signature.</p>
        </div>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run __tests__/components/admin/RightRail-terms.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/proposal-builder/RightRail.tsx __tests__/components/admin/RightRail-terms.test.tsx
git commit -m "feat(proposal-builder): fixed terms editor in the right rail"
```

---

### Task 6: terms on the public response page and print view

**Files:**
- Modify: `actions/proposals-public.ts` (`PublicProposal` + projection)
- Modify: `components/proposals/ProposalResponseClient.tsx`
- Modify: `app/(public)/proposals/[token]/print/page.tsx`
- Test: `__tests__/actions/proposals-public.test.ts`, `__tests__/components/proposals/ProposalResponseClient-terms.test.tsx` (create)

**Interfaces:**
- Consumes: `Proposal.terms` (Task 1).
- Produces: `PublicProposal.terms?: string`; a "Terms" card rendered between the Notes card and the sign form; a "Terms" section on the print page.

- [ ] **Step 1: Write the failing projection test**

In `__tests__/actions/proposals-public.test.ts`, find the existing `getPublicProposal` projection tests and add, using the file's fixture pattern:

```ts
  it('projects terms when present and omits the key when absent', async () => {
    // reuse the file's helper that seeds a sent proposal; add terms to the seeded doc
    // (whatever the file's seed shape is called — extend it with: terms: 'No refunds.')
    const withTerms = await getPublicProposal('tok-with-terms')
    expect(withTerms?.terms).toBe('No refunds.')

    const withoutTerms = await getPublicProposal('tok-plain')
    expect(withoutTerms && Object.keys(withoutTerms)).not.toContain('terms')
  })
```

Wire the two tokens through the file's existing Firestore mock exactly the way its neighboring projection tests seed proposals (the file already distinguishes docs by token).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: the new test FAILS (`terms` never projected).

- [ ] **Step 3: Implement the projection**

In `actions/proposals-public.ts`:

1. Add to `PublicProposal`, under `deposit_terms?: string`:

```ts
  terms?: string
```

2. In `getPublicProposal`, with the other conditional copies:

```ts
  if (proposal.terms !== undefined) publicProposal.terms = proposal.terms
```

- [ ] **Step 4: Run the projection test**

Run: `npx vitest run __tests__/actions/proposals-public.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing render test**

Create `__tests__/components/proposals/ProposalResponseClient-terms.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'
import type { PublicProposal } from '@/actions/proposals-public'

vi.mock('@/actions/proposals-public', () => ({
  respondToProposal: vi.fn(),
  signProposal: vi.fn(),
  recordProposalView: vi.fn().mockResolvedValue(undefined),
  getPublicProposal: vi.fn(),
}))
vi.mock('@/components/proposals/ProposalDepositPayment', () => ({
  ProposalDepositPayment: () => null,
}))

const proposal: PublicProposal = {
  status: 'sent',
  line_items: [{ id: 'i1', description: 'Coffee cart', quantity: 1, unit_price: 500 }],
  created_at: '2026-08-09T00:00:00.000Z',
  terms: 'A 50% deposit reserves your date.',
}

describe('ProposalResponseClient terms', () => {
  it('renders the terms card above the sign form', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal} />)
    expect(screen.getByText('Terms')).toBeInTheDocument()
    expect(screen.getByText('A 50% deposit reserves your date.')).toBeInTheDocument()
    // Order: the Terms heading must precede the sign form heading in the document
    const headings = screen.getAllByText(/Terms|Sign to accept/)
    expect(headings[0]).toHaveTextContent('Terms')
  })

  it('renders no terms card when the proposal has none', () => {
    render(<ProposalResponseClient token="tok" proposal={{ ...proposal, terms: undefined }} />)
    expect(screen.queryByText('Terms')).not.toBeInTheDocument()
  })
})
```

(If rendering trips over an unmocked import, mock that module the same null-component way — keep the two behavioral assertions unchanged.)

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run __tests__/components/proposals/ProposalResponseClient-terms.test.tsx`
Expected: FAIL — no Terms card.

- [ ] **Step 7: Implement the render**

1. In `components/proposals/ProposalResponseClient.tsx`, between the Notes card (`{proposal.notes && (...)}`, ~line 306–315) and the sign form (`{showForm && (...)}`), insert:

```tsx
        {proposal.terms && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.terms}</p>
            </CardContent>
          </Card>
        )}
```

(The sign form's existing consent line — "I agree to the terms above and consent to sign electronically." — now truthfully covers this card. No new checkbox.)

2. In `app/(public)/proposals/[token]/print/page.tsx`, next to the `deposit_terms` block (~line 159) and mirroring the Notes section's markup (~line 166), add:

```tsx
      {proposal.terms && (
        <div className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Terms</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{proposal.terms}</p>
        </div>
      )}
```

Match the exact wrapper element/classes the Notes section uses in that file — the Notes section is the template.

- [ ] **Step 8: Run tests**

Run: `npx vitest run __tests__/components/proposals/ProposalResponseClient-terms.test.tsx __tests__/actions/proposals-public.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit — Stage 1 complete**

```bash
git add actions/proposals-public.ts components/proposals/ProposalResponseClient.tsx 'app/(public)/proposals/[token]/print/page.tsx' __tests__/actions/proposals-public.test.ts __tests__/components/proposals/ProposalResponseClient-terms.test.tsx
git commit -m "feat(proposals): terms render on public response and print pages"
```

---

### Task 7: convert gate + attachment chips drop contracts

**Files:**
- Modify: `lib/opportunity-detail.ts`
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx`
- Modify: `components/admin/opportunity/TasksAndDocuments.tsx`
- Test: `__tests__/lib/opportunity-detail.test.ts`, `__tests__/components/opportunity/AttachmentChips.test.tsx`, `__tests__/components/opportunity/tasks-and-documents.test.tsx`, `__tests__/components/opportunity/OpportunityDetailClient.test.tsx`

**Interfaces:**
- Consumes: nothing new — this narrows existing signatures.
- Produces:
  - `convertBlockReason(i: { stage: LeadStage; proposals: Pick<Proposal, 'status'>[]; guestCount?: number })` — the `contracts` param is GONE. Signing a proposal IS accepting it (`signProposal` writes `status: 'accepted'` + `signature` together), so "accepted proposal" already means "signed document."
  - `attachmentChips(i: { tasks; proposals; invoices; vendors; today })` — no `contracts` input, no `'contract'` chip; `AttachmentChip['kind']` becomes `'task' | 'proposal' | 'invoice' | 'vendor'`.
  - `TasksAndDocumentsProps` and `OpportunityDetailClientProps` lose `contracts`.

- [ ] **Step 1: Update the lib tests to the new contract-free signatures**

In `__tests__/lib/opportunity-detail.test.ts`: delete `contracts: [...]` from every `convertBlockReason` and `attachmentChips` call; delete tests that assert the "contract is unsigned" block or the contract chip; update the no-accepted-proposal expectation to the new message:

```ts
  it('blocks until a proposal is signed', () => {
    const r = convertBlockReason({ stage: 'proposal', proposals: [{ status: 'sent' }], guestCount: 40 })
    expect(r.ready).toBe(false)
    expect(r.message).toBe('Blocked: no signed proposal yet. Signed acceptance carries the accepted package and 40 guests into Events.')
  })

  it('is ready to mark won once a proposal is accepted', () => {
    const r = convertBlockReason({ stage: 'proposal', proposals: [{ status: 'accepted' }] })
    expect(r).toEqual({ ready: false, message: 'Ready — mark the deal won to convert.' })
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/opportunity-detail.test.ts`
Expected: FAIL — old signatures still require `contracts`.

- [ ] **Step 3: Implement in `lib/opportunity-detail.ts`**

Replace `convertBlockReason` with:

```ts
/** Why the convert card is blocked (or what would unblock it) short of closed_won. */
export function convertBlockReason(i: {
  stage: LeadStage
  proposals: Pick<Proposal, 'status'>[]
  guestCount?: number
}): { ready: boolean; message: string } {
  if (i.stage === 'closed_won') return { ready: true, message: '' }
  // Signing IS accepting (signProposal writes status + signature together),
  // so an accepted proposal is a signed document — no separate contract gate.
  if (!i.proposals.some((p) => p.status === 'accepted')) {
    const guests = i.guestCount != null ? ` and ${i.guestCount} guests` : ''
    return { ready: false, message: `Blocked: no signed proposal yet. Signed acceptance carries the accepted package${guests} into Events.` }
  }
  return { ready: false, message: 'Ready — mark the deal won to convert.' }
}
```

In `attachmentChips`: remove `contracts: Contract[]` from the input type, delete `const signed = i.contracts.filter(...)` and the contract chip entry from the returned array. Narrow `AttachmentChip`:

```ts
export interface AttachmentChip {
  kind: 'task' | 'proposal' | 'invoice' | 'vendor'
  label: string
  count: number
  hint?: string
  danger?: boolean
}
```

Remove `Contract` from the file's type imports.

- [ ] **Step 4: Update the three callers**

- `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`: delete the `listContracts` import, its entry in the `Promise.all` (and the `contracts` destructure), the `contracts` key in the `convertBlockReason(...)` call, and the `contracts={contracts}` prop.
- `components/admin/OpportunityDetailClient.tsx`: remove `contracts: Contract[]` from the props interface, `contracts` from the destructure, `Contract` from imports, and the `contracts={contracts}` pass-through (~line 136).
- `components/admin/opportunity/TasksAndDocuments.tsx`: remove the `LeadContractsClient` import, the `contracts` prop (interface + destructure + `attachmentChips` call), the `{selected === 'contract' && (...)}` branch, and `Contract` from imports. If the `selected` state is typed via the chip kind union it narrows automatically; if it names `'contract'` explicitly, drop it.

- [ ] **Step 5: Update the component tests**

In `__tests__/components/opportunity/AttachmentChips.test.tsx`, `tasks-and-documents.test.tsx`, and `OpportunityDetailClient.test.tsx`: remove `contracts` fixtures/props, contract-chip assertions, and any contract-tab interaction cases. Where a test asserted chip count/order, update to the four remaining chips (Tasks, Proposals, Invoices, Vendors).

- [ ] **Step 6: Run tests**

Run: `npx vitest run __tests__/lib/opportunity-detail.test.ts __tests__/components/opportunity/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/opportunity-detail.ts 'app/(admin)/[orgSlug]/leads/[leadId]/page.tsx' components/admin/OpportunityDetailClient.tsx components/admin/opportunity/TasksAndDocuments.tsx __tests__/lib/opportunity-detail.test.ts __tests__/components/opportunity/
git commit -m "refactor(crm): convert gate and chips key off signed proposals, not contracts"
```

---

### Task 8: client portal drops the contracts card

**Files:**
- Modify: `actions/client-portal-public.ts`
- Modify: `components/client-portal/ClientPortalView.tsx`
- Test: `__tests__/actions/client-portal-public.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the portal payload type loses `contracts: ClientPortalContract[]` (interface deleted); `ClientPortalView` renders no Contracts card.

- [ ] **Step 1: Update the action test**

In `__tests__/actions/client-portal-public.test.ts`: remove the contracts collection from the Firestore mock (the `Promise.all` in the action will stop querying it), and delete assertions on `portal.contracts`. If a test asserts the full payload shape, drop the `contracts` key from the expectation.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/actions/client-portal-public.test.ts`
Expected: FAIL (payload still carries `contracts`) or PASS if the mock made contracts optional — either way proceed; the type change in Step 3 is load-bearing.

- [ ] **Step 3: Implement**

In `actions/client-portal-public.ts`: delete the `ClientPortalContract` interface, the `contracts` field on the portal payload interface, the `orgRef.collection('contracts')...` entry in the `Promise.all` (and its `contractSnap` destructure), the `contracts` mapping block, and `contracts` in the return. Remove `Contract, ContractStatus` from the type imports.

In `components/client-portal/ClientPortalView.tsx`: delete the Contracts `<Card>` (~lines 145–170) and the `CONTRACT_STATUS_LABELS` import.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/actions/client-portal-public.test.ts __tests__/actions/client-portal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/client-portal-public.ts components/client-portal/ClientPortalView.tsx __tests__/actions/client-portal-public.test.ts
git commit -m "refactor(portal): remove contracts card from client portal"
```

---

### Task 9: delete the contracts feature (routes, components, actions, lib, nav, packs, copy)

**Files:**
- Delete: `app/(admin)/[orgSlug]/contracts/` (whole dir), `app/(admin)/[orgSlug]/leads/[leadId]/contracts/` (whole dir), `app/(public)/contracts/` (whole dir)
- Delete: `components/contracts/ContractSignClient.tsx` (and the now-empty `components/contracts/` dir), `components/admin/LeadContractsClient.tsx`, `components/admin/ContractEditorClient.tsx`, `components/admin/AllContractsTable.tsx`
- Delete: `actions/contracts.ts`, `actions/contracts-public.ts`, `lib/contracts.ts`
- Delete: `__tests__/actions/contracts.test.ts`, `__tests__/actions/contracts-public.test.ts`, `__tests__/lib/contracts.test.ts`
- Modify: `lib/types.ts` (remove `Contract` + `ContractStatus`), `components/layout/AdminSidebar.tsx`, `lib/industry-packs.ts`, `lib/billing-plans.ts`
- Test: `__tests__/components/AdminSidebar.test.tsx`, `__tests__/lib/industry-packs.test.ts`

**Interfaces:**
- Consumes: Tasks 7–8 must already be merged into the branch (they removed every live consumer).
- Produces: no `Contract`/`ContractStatus` symbols anywhere; `ModuleId` union without `'contracts'`; sidebar Pipeline children = Proposals, Invoices. Existing Firestore `contracts` subcollection docs stay inert (confirmed: no real data). `lib/public-profile.ts` keeps `'contracts'` in its reserved-handle list — deliberate, do not remove.

- [ ] **Step 1: Delete the feature files**

```bash
git rm -r 'app/(admin)/[orgSlug]/contracts' 'app/(admin)/[orgSlug]/leads/[leadId]/contracts' 'app/(public)/contracts'
git rm components/contracts/ContractSignClient.tsx components/admin/LeadContractsClient.tsx components/admin/ContractEditorClient.tsx components/admin/AllContractsTable.tsx
git rm actions/contracts.ts actions/contracts-public.ts lib/contracts.ts
git rm __tests__/actions/contracts.test.ts __tests__/actions/contracts-public.test.ts __tests__/lib/contracts.test.ts
```

- [ ] **Step 2: Remove the types**

In `lib/types.ts`, delete the `ContractStatus` type alias and the whole `Contract` interface (~lines 674–689).

- [ ] **Step 3: Sidebar**

In `components/layout/AdminSidebar.tsx`: remove `'contracts'` from the slug list (~line 24), from `PIPELINE_CHILD_SLUGS` (~line 53 — becomes `['proposals', 'invoices']`), and the `{ module: 'contracts', label: 'Contracts', slug: 'contracts' }` nav entry (~line 99).

- [ ] **Step 4: Industry packs + billing copy**

In `lib/industry-packs.ts`: remove `'contracts'` from the `ModuleId` union, from `ALL_CURRENT_MODULES`, and from every pack's `modules` array.
In `lib/billing-plans.ts`: the blurb `'…— leads, proposals, invoices, contracts.'` becomes `'…— leads, proposals, invoices.'`.

- [ ] **Step 5: Update the remaining tests**

- `__tests__/components/AdminSidebar.test.tsx`: drop Contracts from expected nav/pipeline-children assertions.
- `__tests__/lib/industry-packs.test.ts`: drop `'contracts'` from expected module lists.
- `__tests__/lib/opportunity-health.test.ts`: leave `waiting: { reason: 'signed contract' }` alone — that's free-text user content, not a code reference.

- [ ] **Step 6: Leftover-reference sweep**

Run: `grep -rn -i "contract" app components lib actions __tests__ --include='*.ts' --include='*.tsx'`
Expected surviving hits, ALL benign — anything else must be fixed:
- `lib/ops/event-ops.ts` — the word in an "Idempotency contract" comment.
- `lib/public-profile.ts` — the reserved handle `'contracts'` (kept deliberately).
- `__tests__/lib/opportunity-health.test.ts` — the `'signed contract'` waiting-reason fixture string.

- [ ] **Step 7: Full test suite + build**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: ALL PASS.
Run: `npx next build`
Expected: clean build (this is the gate that catches `'use server'` export violations tsc misses).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(contracts)!: remove standalone contracts — the signed proposal is the agreement"
```

---

### Task 10: roadmap + ship

**Files:**
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: everything above, green.
- Produces: roadmap reflects the change; branch pushed and PR opened.

- [ ] **Step 1: Update the roadmap**

In `docs/ROADMAP.md`: bump the "Last updated" date; add under **Shipped**:

```markdown
- **One signed document** — proposals carry legal `terms` (org default in
  Branding → Proposal terms, per-proposal editable, hash-covered by the
  e-signature); the standalone contracts feature (pages, nav, portal card,
  convert gate) is removed
  (spec: `superpowers/specs/2026-08-09-proposal-terms-contracts-retirement-design.md`).
```

Check the **In flight** / **Open decisions** sections for stale contract mentions and adjust only if one directly contradicts this change.

- [ ] **Step 2: Final verification before claiming done**

Run: `npx vitest run --exclude '**/.claude/**' && npx next build`
Expected: both green. Do not claim completion without this output in hand (superpowers:verification-before-completion).

- [ ] **Step 3: Commit, push, PR**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap — one signed document (proposal terms, contracts retired)"
```

```bash
gh auth switch --user Lifewithmo 2>/dev/null; git push -u origin claude/proposal-terms-retire-contracts
```

Open a PR against `main` in Lifewithmo/traxevent titled "One signed document: proposal terms + contracts retirement", body summarizing Stage 1 (additive terms) and Stage 2 (removal), linking the spec, and noting the manual walk still owed: create proposal → see seeded terms → edit in rail → send → public page shows terms above sign box → sign → hash recorded → convert guidance reads "signed proposal".
