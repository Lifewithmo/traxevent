# Customer Proposal Document — Increment 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer-facing proposal from a schema-ordered stack of admin `Card`s into a designed document — an ordered **section archetype** layer with one shared composition serving the public page, print, and the builder canvas — and close every WCAG blocker plus the two live send-path defects.

**Architecture:** A `ProposalSection` layer sits *above* the existing `ProposalBlock` union (never replacing it), so signed/hash-covered proposals are untouched and legacy documents map to one implicit `prose` section with zero writes. Pure modules (`lib/proposals/sections.ts`) do all validation and treatment computation; a single `ProposalComposition` component renders the ordered archetypes and is consumed by the public page, the print route, and the builder canvas — killing the last duplicated composition. The polish gate lands in `sendProposal`, the only writer of `status: 'sent'`.

**Tech Stack:** Next.js 16 (App Router, `params` is a Promise, `proxy.ts` not `middleware.ts`), React 19, Tailwind v4 (warm ramp in `app/globals.css`), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-18-customer-proposal-document-design.md` — read §5 (hard gates), §10 (archetypes + legacy migration), §12 (polish gate), §15 (absence rule) before starting.

## Scope: this is the first of four plans

Increment 1 in the spec is four separable subsystems. This plan is the foundation the others need:

| Plan | Content | Status |
|---|---|---|
| **This one** | Section archetype layer, legacy adapter, shared composition, decision-flow ordering, all AA fixes, peak-end state, send gate | **Now** |
| inc1-fonts | `OrgBranding` font family + resolved font binaries (Decision 4b; Typst needs real font bytes) | Next |
| inc1-typst | Typst renderer + archetype→Typst template, retire the HTML print route (§14) | After archetypes land |
| inc1-media | Ambient silent loop archetype (§9.1), gallery/team authoring UI | Parallel-safe |

**Deliberately NOT in this plan:** the `menu`, `day_plan`, `team`, `gallery`, and `video` archetypes' *authoring UI*. Their **types and render slots ship here** so the ordering, alternation, and Typst mapping are correct from day one; each falls back to `prose` rendering until its own plan lands. This is the cheapest way to avoid re-cutting the layout later.

## Global Constraints

- **The proposal canvas is PERMANENTLY WHITE PAPER.** Never use semantic tokens (`text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`) anywhere inside `<ProposalTheme>`. Use explicit `var(--warm-N)` literals. `--warm-*` has no `.dark` override by design; semantic tokens do, and using them breaks dark mode AND light-mode WYSIWYG parity. Each canvas/document file carries a `COLOUR RULE` header comment — preserve it.
- **Money on the paper stays `toFixed(2)`** across `ProposalPricing`, the builder canvases, `ProposalBuilderClient.money()`, and the send dialog. They are WYSIWYG-locked; changing one without all of them makes the "Client sees:" claim false.
- **Never regenerate** `__tests__/fixtures/proposal-signature-goldens.json`. Any new field must be hash-covered **only-when-present**, exactly as `terms` was, so existing signed hashes stay valid. `lib/proposal-signature.ts` hashes canonical *content*, never layout — no work in this plan may change that.
- **WCAG 2.2 AA is a blocker, not a goal:** 4.5:1 body / 3:1 large text and UI components; interactive targets **≥44px** on this surface (it is a phone-first customer document, not admin chrome).
- **Hero scrim is fixed arithmetic, not a gate.** `bg-black/60` guarantees ≥4.5:1 for white text against *any* cover image (α ≥ 0.535 solves the WCAG formula against pure white). Never revert to `black/40` (2.85:1 worst case) and never sample the image.
- **The absence rule (§15.1):** no section is required, and a missing section must never read as missing. Alternating treatments are computed from the **rendered** sequence, never authored per-section.
- **`Button render={<Link/>}` needs BOTH `nativeButton={false}` and `role="link"`** — Base UI stamps `type="button"` and `role="button"` onto the anchor otherwise.
- **Tests:** `npx vitest run --exclude '**/.claude/**'` (the bare command scans sibling worktrees and fails). A task is done only when that passes. The final task also runs `npx next build` — `tsc` alone will not catch the `'use server'` type re-export trap.
- **Worktree:** branch from `origin/main`, NOT the current branch. `brewtrax-marketing-inc1` is a marketing branch and is behind main. The primary checkout is contended by concurrent sessions — work in a dedicated worktree, and `npm install` + copy `.env.local` into it.
- `AGENTS.md`: this is a modified Next.js — consult `node_modules/next/dist/docs/` before any routing/rendering change.

---

## File Structure

**Create:**
- `lib/proposals/sections.ts` — pure: `ProposalSectionType` vocabulary, `normalizeSections`, `sectionsFromProposal` (legacy adapter), `sectionTreatment` (alternation). No React.
- `components/proposals/ProposalComposition.tsx` — the single ordered-archetype renderer consumed by public, print, and builder.
- `components/proposals/sections/CoverSection.tsx` — full-bleed cover with the guaranteed scrim.
- `components/proposals/sections/ProseSection.tsx` — measure-controlled block rendering (serves `prose`, `letter`, `logistics`, and the not-yet-authored archetypes).
- `components/proposals/AcceptedState.tsx` — the peak-end "what happens now" state.
- `lib/proposals/send-gate.ts` — pure: `evaluateSendGate(proposal)` → failed checks.
- Tests mirroring each under `__tests__/`.

**Modify:**
- `lib/types.ts` — add `ProposalSection`, `PROPOSAL_SECTION_TYPES`, `Proposal.sections?`, `ProposalTemplate.sections?`.
- `lib/proposals/draft-core.ts` — add `sections` to the clearable-field whitelist so autosave can persist it.
- `components/proposals/ProposalPricing.tsx` — 44px targets, AA ink, expiry prominence.
- `components/proposals/ProposalResponseClient.tsx` — decision-flow order, retire `Card` chrome, signer pre-fill, peak-end.
- `app/(public)/proposals/[token]/page.tsx` — pass `leadContact` for pre-fill.
- `app/(public)/proposals/[token]/print/page.tsx` — consume `ProposalComposition` (deletes its duplicated composition).
- `actions/proposals.ts` — `sendProposal` gate + override.
- `actions/proposals-public.ts` — add pre-fill contact to the `PublicProposal` allowlist.

---

### Task 1: Section vocabulary and normalization

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/proposals/sections.ts`
- Test: `__tests__/lib/proposals/sections.test.ts`

**Interfaces:**
- Consumes: `ProposalBlock`, `normalizeBlocks` from `@/lib/proposals/blocks`.
- Produces: `PROPOSAL_SECTION_TYPES`, `ProposalSectionType`, `ProposalSection`, `normalizeSections(input: unknown): { sections: ProposalSection[]; adjustments: string[] }`, `MAX_SECTIONS = 24`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/proposals/sections.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSections, MAX_SECTIONS } from '@/lib/proposals/sections'

describe('normalizeSections', () => {
  it('returns empty for non-array input', () => {
    expect(normalizeSections(undefined).sections).toEqual([])
    expect(normalizeSections('nope').sections).toEqual([])
  })

  it('keeps a known section type and normalizes its blocks', () => {
    const { sections } = normalizeSections([
      { id: 's1', type: 'letter', blocks: [{ id: 'b1', type: 'paragraph', text: 'Hi' }] },
    ])
    expect(sections).toHaveLength(1)
    expect(sections[0].type).toBe('letter')
    expect(sections[0].blocks).toEqual([{ id: 'b1', type: 'paragraph', text: 'Hi' }])
  })

  it('drops an unknown section type and reports it', () => {
    const { sections, adjustments } = normalizeSections([{ id: 's1', type: 'wat' }])
    expect(sections).toEqual([])
    expect(adjustments[0]).toContain('wat')
  })

  it('mints ids for missing or colliding ones', () => {
    const { sections } = normalizeSections([
      { type: 'tiers' },
      { id: 'sec-0', type: 'investment' },
      { type: 'accept' },
    ])
    const ids = sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('preserves placeholder: true only, and drops other values', () => {
    const { sections } = normalizeSections([
      { id: 'a', type: 'menu', placeholder: true },
      { id: 'b', type: 'menu', placeholder: 'yes' },
    ])
    expect(sections[0].placeholder).toBe(true)
    expect(sections[1].placeholder).toBeUndefined()
  })

  it('caps the section count', () => {
    const many = Array.from({ length: MAX_SECTIONS + 5 }, () => ({ type: 'prose' }))
    const { sections, adjustments } = normalizeSections(many)
    expect(sections).toHaveLength(MAX_SECTIONS)
    expect(adjustments.join(' ')).toContain(String(MAX_SECTIONS))
  })

  it('omits blocks entirely for a derived section', () => {
    const { sections } = normalizeSections([
      { id: 's1', type: 'tiers', blocks: [{ id: 'b1', type: 'paragraph', text: 'ignored' }] },
    ])
    expect(sections[0].blocks).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/lib/proposals/sections`.

- [ ] **Step 3: Add the types**

Add to `lib/types.ts`, immediately after the `ProposalBlock` union (~line 552):

```ts
// Section archetypes (customer document spec §10). A section layer sits ABOVE
// ProposalBlock rather than replacing it: legacy proposals carry only `blocks`
// and map to one implicit `prose` section (see sectionsFromProposal), so no
// migration runs and no signed document is touched.
//
// AUTHORED sections carry `blocks`. DERIVED sections (tiers/investment/accept/
// terms) render from Proposal fields and must never carry blocks — normalization
// strips them so the two can never disagree.
export const PROPOSAL_SECTION_TYPES = [
  'cover', 'letter', 'video', 'gallery', 'team', 'testimonial', 'menu',
  'day_plan', 'logistics', 'tiers', 'add_ons', 'investment', 'accept',
  'terms', 'prose',
] as const
export type ProposalSectionType = (typeof PROPOSAL_SECTION_TYPES)[number]

/** Sections that render from Proposal fields, never from authored blocks. */
export const DERIVED_SECTION_TYPES = ['tiers', 'add_ons', 'investment', 'accept', 'terms'] as const

export interface ProposalSection {
  id: string
  type: ProposalSectionType
  blocks?: ProposalBlock[]
  placeholder?: boolean
}
```

Then add to `interface Proposal`, directly under the existing `blocks?` line:

```ts
  sections?: ProposalSection[]  // ordered archetypes; absent = legacy, see sectionsFromProposal
```

And the identical line to `interface ProposalTemplate`, under its `blocks?` line — templates store the same content shape, so the archetype layer must reach them or templates keep producing the old block soup (spec §15.2).

- [ ] **Step 4: Write the implementation**

```ts
// lib/proposals/sections.ts
import { normalizeBlocks } from '@/lib/proposals/blocks'
import {
  PROPOSAL_SECTION_TYPES,
  DERIVED_SECTION_TYPES,
  type ProposalSection,
  type ProposalSectionType,
} from '@/lib/types'

export const MAX_SECTIONS = 24

const KNOWN = new Set<string>(PROPOSAL_SECTION_TYPES)
const DERIVED = new Set<string>(DERIVED_SECTION_TYPES)

export interface NormalizeSectionsResult {
  sections: ProposalSection[]
  adjustments: string[]
}

/**
 * Validate untrusted section input. Mirrors normalizeBlocks' contract: invalid
 * entries are dropped rather than thrown, and every change is reported.
 */
export function normalizeSections(input: unknown): NormalizeSectionsResult {
  const adjustments: string[] = []
  if (!Array.isArray(input)) return { sections: [], adjustments }

  const capped = input.slice(0, MAX_SECTIONS)
  if (input.length > capped.length) {
    adjustments.push(`Kept the first ${MAX_SECTIONS} sections and dropped ${input.length - MAX_SECTIONS}.`)
  }

  const seen = new Set<string>()
  const sections: ProposalSection[] = []

  capped.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const s = raw as Record<string, unknown>
    const type = typeof s.type === 'string' ? s.type : ''
    if (!KNOWN.has(type)) {
      adjustments.push(`Dropped an unsupported section of type "${type || 'unknown'}".`)
      return
    }

    // Same collision walk as normalizeBlocks: a section may legitimately carry
    // the id `sec-1`, which would collide with the fallback minted at index 1.
    let id = typeof s.id === 'string' ? s.id.trim() : ''
    if (!id || seen.has(id)) {
      let n = index
      while (seen.has(`sec-${n}`)) n += 1
      id = `sec-${n}`
    }
    seen.add(id)

    const placeholder = s.placeholder === true ? { placeholder: true as const } : {}

    // Derived sections render from Proposal fields; carrying blocks would let
    // authored content contradict the computed pricing.
    if (DERIVED.has(type)) {
      sections.push({ id, type: type as ProposalSectionType, ...placeholder })
      return
    }

    const { blocks, adjustments: blockAdjustments } = normalizeBlocks(s.blocks)
    adjustments.push(...blockAdjustments)
    sections.push({
      id,
      type: type as ProposalSectionType,
      ...(blocks.length ? { blocks } : {}),
      ...placeholder,
    })
  })

  return { sections, adjustments }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposals/sections.ts __tests__/lib/proposals/sections.test.ts
git commit -m "feat(proposals): add ProposalSection archetype vocabulary and normalization"
```

---

### Task 2: Legacy adapter — sections without a migration

**Files:**
- Modify: `lib/proposals/sections.ts`
- Test: `__tests__/lib/proposals/sections.test.ts`

**Interfaces:**
- Consumes: `Proposal` from `@/lib/types`.
- Produces: `sectionsFromProposal(p: Pick<Proposal, 'sections' | 'blocks' | 'packages' | 'line_items' | 'terms' | 'notes'>): ProposalSection[]` — always returns a renderable ordered list; never writes.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/proposals/sections.test.ts`:

```ts
import { sectionsFromProposal } from '@/lib/proposals/sections'

describe('sectionsFromProposal', () => {
  const base = { line_items: [], blocks: undefined, sections: undefined }

  it('returns explicit sections unchanged when present', () => {
    const sections = [{ id: 's1', type: 'letter' as const }]
    expect(sectionsFromProposal({ ...base, sections })).toEqual(sections)
  })

  it('maps a legacy blocks-only proposal to one prose section plus derived ones', () => {
    const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'Legacy' }]
    const out = sectionsFromProposal({ ...base, blocks })
    expect(out.map((s) => s.type)).toEqual(['prose', 'investment', 'accept'])
    expect(out[0].blocks).toEqual(blocks)
  })

  it('includes tiers only when the proposal has packages', () => {
    const out = sectionsFromProposal({
      ...base,
      packages: [{ id: 'p1', name: 'Basic', price: 100 }],
    })
    expect(out.map((s) => s.type)).toContain('tiers')
  })

  it('includes add_ons only when an optional line item exists', () => {
    const withAddon = sectionsFromProposal({
      ...base,
      line_items: [{ id: 'i1', description: 'Extra', quantity: 1, unit_price: 5, optional: true }],
    })
    expect(withAddon.map((s) => s.type)).toContain('add_ons')

    const without = sectionsFromProposal({
      ...base,
      line_items: [{ id: 'i1', description: 'Base', quantity: 1, unit_price: 5 }],
    })
    expect(without.map((s) => s.type)).not.toContain('add_ons')
  })

  it('places terms AFTER accept, never before it', () => {
    const out = sectionsFromProposal({ ...base, terms: 'Legal text' })
    const types = out.map((s) => s.type)
    expect(types.indexOf('terms')).toBeGreaterThan(types.indexOf('accept'))
  })

  it('never returns an empty list, even for a bare proposal', () => {
    expect(sectionsFromProposal(base).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `sectionsFromProposal is not a function`.

- [ ] **Step 3: Implement the adapter**

Append to `lib/proposals/sections.ts`:

```ts
import type { Proposal } from '@/lib/types'

type LegacySource = Pick<
  Proposal,
  'sections' | 'blocks' | 'packages' | 'line_items' | 'terms' | 'notes'
>

/**
 * The renderable ordered section list for ANY proposal, old or new.
 *
 * Upgrade-on-read, never upgrade-on-write: a legacy proposal (blocks, no
 * sections) is projected to one `prose` section plus the derived pricing
 * sections. Nothing is persisted, so opening a signed or sent proposal can
 * never mutate it and no hash is disturbed. Mirrors the precedent in
 * lib/proposals/upgrade.ts, which upgrades packages on open.
 */
export function sectionsFromProposal(p: LegacySource): ProposalSection[] {
  if (p.sections?.length) return p.sections

  const out: ProposalSection[] = []
  if (p.blocks?.length) out.push({ id: 'sec-prose', type: 'prose', blocks: p.blocks })
  if (p.packages?.length) out.push({ id: 'sec-tiers', type: 'tiers' })
  if ((p.line_items ?? []).some((i) => i.optional === true && i.id)) {
    out.push({ id: 'sec-addons', type: 'add_ons' })
  }
  if (p.notes?.trim()) out.push({ id: 'sec-notes', type: 'prose', blocks: [] })

  // investment + accept are unconditional: every proposal states a price and
  // offers a decision. terms sits AFTER accept by design (spec §4.1) — the two
  // lowest-value sections must not sit above the highest-value moment.
  out.push({ id: 'sec-investment', type: 'investment' })
  out.push({ id: 'sec-accept', type: 'accept' })
  if (p.terms?.trim()) out.push({ id: 'sec-terms', type: 'terms' })

  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/proposals/sections.ts __tests__/lib/proposals/sections.test.ts
git commit -m "feat(proposals): legacy proposals project to sections with no migration"
```

---

### Task 3: The absence rule — treatment computed from rendered order

**Files:**
- Modify: `lib/proposals/sections.ts`
- Test: `__tests__/lib/proposals/sections.test.ts`

**Interfaces:**
- Produces: `type SectionTreatment = 'plain' | 'tinted' | 'bleed'`; `sectionTreatments(sections: ProposalSection[]): SectionTreatment[]`.

**Why this is its own task:** spec §15.1 — if treatments were authored per-section, deleting a section would produce two adjacent identical bands. Computing from the rendered sequence is the mechanism that makes every archetype optional.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/proposals/sections.test.ts`:

```ts
import { sectionTreatments } from '@/lib/proposals/sections'

describe('sectionTreatments (absence rule)', () => {
  const s = (type: string) => ({ id: type, type: type as never })

  it('always gives cover a full bleed', () => {
    expect(sectionTreatments([s('cover'), s('letter')])[0]).toBe('bleed')
  })

  it('never places two tinted bands adjacent', () => {
    const out = sectionTreatments(['letter', 'menu', 'logistics', 'tiers', 'investment'].map(s))
    for (let i = 1; i < out.length; i++) {
      if (out[i] === 'tinted') expect(out[i - 1]).not.toBe('tinted')
    }
  })

  it('stays alternating when a middle section is removed', () => {
    const full = ['letter', 'menu', 'logistics', 'tiers'].map(s)
    const without = ['letter', 'logistics', 'tiers'].map(s)
    for (const out of [sectionTreatments(full), sectionTreatments(without)]) {
      for (let i = 1; i < out.length; i++) {
        if (out[i] === 'tinted') expect(out[i - 1]).not.toBe('tinted')
      }
    }
  })

  it('returns one treatment per section', () => {
    const list = ['cover', 'letter', 'tiers'].map(s)
    expect(sectionTreatments(list)).toHaveLength(list.length)
  })

  it('handles a single-section document', () => {
    expect(sectionTreatments([s('prose')])).toEqual(['plain'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `sectionTreatments is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/proposals/sections.ts`:

```ts
export type SectionTreatment = 'plain' | 'tinted' | 'bleed'

/** Archetypes that are always full-bleed regardless of position. */
const BLEED: ReadonlySet<string> = new Set(['cover', 'video', 'gallery'])

/**
 * Visual treatment per section, derived ONLY from the rendered sequence
 * (spec §15.1, the absence rule).
 *
 * Authoring the treatment per section would mean that deleting one section
 * leaves two identical bands adjacent — "absence that looks like absence".
 * Computing it here means every archetype is safely optional: the rhythm
 * changes when a section is removed, the integrity does not.
 */
export function sectionTreatments(sections: ProposalSection[]): SectionTreatment[] {
  const out: SectionTreatment[] = []
  let lastFlow: SectionTreatment | null = null

  for (const section of sections) {
    if (BLEED.has(section.type)) {
      out.push('bleed')
      // A bleed resets the flow rhythm — the band after it starts plain again.
      lastFlow = null
      continue
    }
    const next: SectionTreatment = lastFlow === 'plain' ? 'tinted' : 'plain'
    out.push(next)
    lastFlow = next
  }

  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/lib/proposals/sections.test.ts --exclude '**/.claude/**'`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/proposals/sections.ts __tests__/lib/proposals/sections.test.ts
git commit -m "feat(proposals): derive section treatment from rendered order (absence rule)"
```

---

### Task 4: The send gate

**Files:**
- Create: `lib/proposals/send-gate.ts`
- Modify: `actions/proposals.ts:77` (`sendProposal`)
- Test: `__tests__/lib/proposals/send-gate.test.ts`

**Interfaces:**
- Consumes: `proposalRange`, `proposalExpiryInstant` from `@/lib/proposals`.
- Produces: `type SendGateCheck = 'no_price' | 'placeholders' | 'expired' | 'empty_document'`; `evaluateSendGate(p, now: Date): SendGateCheck[]`; `SEND_GATE_MESSAGES: Record<SendGateCheck, string>`.

**Why:** spec §12. Fixes two live defects — you can currently send an already-expired proposal (expiry is only enforced at signing), and placeholder blocks are silently stripped from customer output so a client receives a document with holes and nobody is told.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/proposals/send-gate.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateSendGate, SEND_GATE_MESSAGES } from '@/lib/proposals/send-gate'

const NOW = new Date('2026-08-18T12:00:00Z')
const ok = {
  line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
  blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Real content' }],
}

describe('evaluateSendGate', () => {
  it('passes a complete proposal', () => {
    expect(evaluateSendGate(ok, NOW)).toEqual([])
  })

  it('flags a proposal with no price', () => {
    expect(evaluateSendGate({ ...ok, line_items: [] }, NOW)).toContain('no_price')
  })

  it('flags remaining placeholder blocks', () => {
    const blocks = [...ok.blocks, { id: 'b2', type: 'heading' as const, text: 'TBD', placeholder: true }]
    expect(evaluateSendGate({ ...ok, blocks }, NOW)).toContain('placeholders')
  })

  it('flags an already-expired proposal', () => {
    expect(evaluateSendGate({ ...ok, expires_at: '2026-08-01' }, NOW)).toContain('expired')
  })

  it('does not flag a future expiry', () => {
    expect(evaluateSendGate({ ...ok, expires_at: '2026-12-01' }, NOW)).not.toContain('expired')
  })

  it('flags an empty document once placeholders are stripped', () => {
    const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'x', placeholder: true }]
    expect(evaluateSendGate({ ...ok, blocks }, NOW)).toContain('empty_document')
  })

  it('has a human message for every check it can return', () => {
    const all = evaluateSendGate({ line_items: [], blocks: [], expires_at: '2026-01-01' }, NOW)
    for (const check of all) expect(SEND_GATE_MESSAGES[check]).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/proposals/send-gate.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/lib/proposals/send-gate`.

- [ ] **Step 3: Implement the pure gate**

```ts
// lib/proposals/send-gate.ts
import { proposalRange, proposalExpiryInstant } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

export type SendGateCheck = 'no_price' | 'placeholders' | 'expired' | 'empty_document'

export const SEND_GATE_MESSAGES: Record<SendGateCheck, string> = {
  no_price: 'This proposal has no price — add a line item or a package.',
  placeholders: 'Some sections are still placeholders. They are hidden from the customer, so the document would arrive with holes.',
  expired: 'The expiry date has already passed — the customer could not accept this.',
  empty_document: 'There is nothing for the customer to read yet.',
}

type GateInput = Pick<Proposal, 'line_items' | 'blocks' | 'packages' | 'expires_at'>

/**
 * The blocking craft checks, all computable from the proposal document with no
 * schema change (spec §12).
 *
 * Deliberately NOT checked here: hero contrast (made unfailable by the fixed
 * scrim constant), measure/widows (guaranteed by the layout system, not
 * detectable from data), and image resolution (no dimensions are captured, so
 * a check that passes on `undefined` for the entire existing corpus is theater).
 */
export function evaluateSendGate(p: GateInput, now: Date): SendGateCheck[] {
  const failed: SendGateCheck[] = []

  const range = proposalRange({
    packages: p.packages,
    line_items: p.line_items ?? [],
  })
  if (range.max <= 0) failed.push('no_price')

  const blocks = p.blocks ?? []
  if (blocks.some((b) => b.placeholder === true)) failed.push('placeholders')

  // The customer never sees placeholder blocks (ProposalDocument strips them),
  // so "empty" must be judged on what actually ships.
  if (blocks.filter((b) => b.placeholder !== true).length === 0) failed.push('empty_document')

  if (p.expires_at && now.getTime() > new Date(proposalExpiryInstant(p.expires_at)).getTime()) {
    failed.push('expired')
  }

  return failed
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/lib/proposals/send-gate.test.ts --exclude '**/.claude/**'`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire it into the only writer of `status: 'sent'`**

In `actions/proposals.ts`, change the `sendProposal` signature and add the gate immediately after the existing signature-lock check. The override shape mirrors `voidProposal`, which already requires and persists a reason.

```ts
export async function sendProposal(
  orgId: string,
  proposalId: string,
  override?: { reason: string },
): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  const proposalBeforeSend = snap?.exists ? (snap.data() as Proposal) : undefined
  if (proposalBeforeSend) {
    if (proposalBeforeSend.signature || proposalBeforeSend.pending_signature) {
      throw new Error('This proposal is signed and can no longer be edited')
    }

    // The polish gate (spec §12). It lives HERE and not in SendDialog because a
    // server action is a public POST endpoint and the dialog is documented
    // "Presentational only" — its warnings sit beside an always-enabled button.
    // This action is the only writer of status:'sent' in the codebase.
    const failed = evaluateSendGate(proposalBeforeSend, new Date())
    if (failed.length > 0 && !override?.reason?.trim()) {
      throw new Error(failed.map((c) => SEND_GATE_MESSAGES[c]).join(' '))
    }
    if (failed.length > 0 && override?.reason?.trim()) {
      await ref.update({
        sent_override: {
          reason: override.reason.trim(),
          checks: failed,
          at: new Date().toISOString(),
        },
      })
    }
  }

  await ref.update({ status: 'sent', updated_at: new Date().toISOString() })
```

Add the import at the top of `actions/proposals.ts`:

```ts
import { evaluateSendGate, SEND_GATE_MESSAGES } from '@/lib/proposals/send-gate'
```

Add to `interface Proposal` in `lib/types.ts`, under `void_reason`:

```ts
  sent_override?: { reason: string; checks: string[]; at: string }  // polish gate bypass (spec §12)
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS. If an existing `sendProposal` test fails because its fixture has no price or no blocks, fix the **fixture** to be a realistic sendable proposal — do not weaken the gate.

- [ ] **Step 7: Commit**

```bash
git add lib/proposals/send-gate.ts actions/proposals.ts lib/types.ts __tests__/lib/proposals/send-gate.test.ts
git commit -m "feat(proposals): block sending a proposal that fails the craft checks"
```

---

### Task 5: The cover section — contrast guaranteed by arithmetic

**Files:**
- Create: `components/proposals/sections/CoverSection.tsx`
- Test: `__tests__/components/proposals/CoverSection.test.tsx`

**Interfaces:**
- Consumes: `OrgBranding` from `@/lib/types`.
- Produces: `CoverSection` — props `{ title: string; branding?: OrgBranding; clientName?: string; eventDate?: string }`. Exports `SCRIM_CLASS = 'bg-black/60'`.

**Why the constant matters:** `bg-black/40` over a near-white cover composites to `#999999` — **2.85:1** for white text, failing AA *and* the 3:1 large-text floor. α ≥ 0.535 solves the WCAG formula against pure white, so `bg-black/60` is unconditionally AA for **any** image. This eliminates the failure mode rather than detecting it.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/proposals/CoverSection.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CoverSection, SCRIM_CLASS } from '@/components/proposals/sections/CoverSection'

describe('CoverSection', () => {
  it('renders the title', () => {
    render(<CoverSection title="Summer Launch Party" />)
    expect(screen.getByRole('heading', { name: 'Summer Launch Party' })).toBeInTheDocument()
  })

  it('falls back to a generic title', () => {
    render(<CoverSection title="" />)
    expect(screen.getByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
  })

  it('uses a scrim opacity that guarantees AA against any cover image', () => {
    // alpha >= 0.535 guarantees 4.5:1 for white text over pure white.
    const alpha = Number(SCRIM_CLASS.match(/black\/(\d+)/)![1]) / 100
    expect(alpha).toBeGreaterThanOrEqual(0.535)
  })

  it('applies the scrim whenever a cover image is present', () => {
    const { container } = render(
      <CoverSection title="X" branding={{ cover_image_url: 'https://x/i.jpg' }} />,
    )
    expect(container.querySelector(`.${CSS.escape(SCRIM_CLASS)}`)).not.toBeNull()
  })

  it('shows the client name and event date when supplied', () => {
    render(<CoverSection title="X" clientName="Acme Co" eventDate="Sat 12 Oct" />)
    expect(screen.getByText('Acme Co')).toBeInTheDocument()
    expect(screen.getByText('Sat 12 Oct')).toBeInTheDocument()
  })

  it('renders no logo img when branding has none', () => {
    const { container } = render(<CoverSection title="X" branding={{}} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/CoverSection.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```tsx
// components/proposals/sections/CoverSection.tsx
//
// COLOUR RULE: this renders inside <ProposalTheme> on permanently-white paper.
// Use explicit var(--warm-N) literals and the --proposal-* variables ONLY.
// Never use semantic tokens (text-foreground, bg-card, text-muted-foreground):
// they carry .dark overrides, the warm ramp does not, and mixing them breaks
// dark mode AND light-mode WYSIWYG parity with what the customer receives.
import type { OrgBranding } from '@/lib/types'

/**
 * The scrim is FIXED ARITHMETIC, not a tunable design choice.
 *
 * Cover images are operator-uploaded and unbounded. Solving the WCAG contrast
 * formula for the alpha that holds against the worst possible image (pure
 * white) gives alpha >= 0.535 for 4.5:1 with white text. The previous bg-black/40
 * composited to #999999 over a bright cover — 2.85:1, failing AA and even the
 * 3:1 large-text floor. Do not lower this, and do not replace it with image
 * sampling: there is no server-side image decoder in the dependency tree.
 */
export const SCRIM_CLASS = 'bg-black/60'

export function CoverSection({
  title,
  branding,
  clientName,
  eventDate,
}: {
  title: string
  branding?: OrgBranding
  clientName?: string
  eventDate?: string
}) {
  const heading = title.trim() || 'Proposal'
  const hasImage = Boolean(branding?.cover_image_url)

  return (
    <header
      className="relative w-full bg-cover bg-center"
      data-testid="proposal-cover"
      style={
        hasImage
          ? { backgroundImage: `url(${branding!.cover_image_url})` }
          : { backgroundColor: 'var(--proposal-accent, #111827)' }
      }
    >
      <div className={hasImage ? SCRIM_CLASS : ''}>
        <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
          {branding?.logo_url && (
            /* Plain <img> matches ProposalDocument: next.config.ts has no
               images.remotePatterns, and next/image would couple this to the
               storage bucket domain. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logo_url}
              alt={`${branding.display_name ?? 'Company'} logo`}
              className="mb-6 h-12 w-auto"
            />
          )}
          <h1 className="text-balance text-4xl font-bold leading-tight text-white sm:text-5xl">
            {heading}
          </h1>
          {(clientName || eventDate) && (
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-base text-white">
              {clientName && <span>{clientName}</span>}
              {clientName && eventDate && <span aria-hidden="true">·</span>}
              {eventDate && <span>{eventDate}</span>}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
```

Note: the subtitle is `text-white`, not the previous `text-white/80` — at 80% over the scrim it measured ≈2.4:1.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/components/proposals/CoverSection.test.tsx --exclude '**/.claude/**'`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/proposals/sections/CoverSection.tsx __tests__/components/proposals/CoverSection.test.tsx
git commit -m "fix(proposals): guarantee AA hero contrast over any cover image"
```

---

### Task 6: The prose section — measure and typographic rhythm

**Files:**
- Create: `components/proposals/sections/ProseSection.tsx`
- Test: `__tests__/components/proposals/ProseSection.test.tsx`

**Interfaces:**
- Consumes: `ProposalDocument` from `@/components/proposals/ProposalDocument`, `SectionTreatment` from `@/lib/proposals/sections`.
- Produces: `ProseSection` — props `{ blocks?: ProposalBlock[]; treatment: SectionTreatment; showPlaceholders?: boolean }`.

**Why measure lives here:** widows, orphans and line length are **not** server-checkable (they are layout-determined), so they must be guaranteed by the layout system rather than caught by the gate. `max-w-[68ch]` + `text-wrap: pretty` is that guarantee.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/proposals/ProseSection.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProseSection } from '@/components/proposals/sections/ProseSection'

const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'Hello there' }]

describe('ProseSection', () => {
  it('renders its blocks', () => {
    render(<ProseSection blocks={blocks} treatment="plain" />)
    expect(screen.getByText('Hello there')).toBeInTheDocument()
  })

  it('constrains the measure so line length never runs long', () => {
    const { container } = render(<ProseSection blocks={blocks} treatment="plain" />)
    expect(container.querySelector('[data-measure]')?.className).toContain('max-w-[68ch]')
  })

  it('renders nothing when it has no visible blocks', () => {
    const { container } = render(<ProseSection blocks={[]} treatment="plain" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when every block is a placeholder', () => {
    const ph = [{ id: 'b1', type: 'paragraph' as const, text: 'TBD', placeholder: true }]
    const { container } = render(<ProseSection blocks={ph} treatment="plain" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows placeholders when the builder opts in', () => {
    const ph = [{ id: 'b1', type: 'paragraph' as const, text: 'TBD', placeholder: true }]
    render(<ProseSection blocks={ph} treatment="plain" showPlaceholders />)
    expect(screen.getByText('TBD')).toBeInTheDocument()
  })

  it('applies a tint only for the tinted treatment', () => {
    const { container: plain } = render(<ProseSection blocks={blocks} treatment="plain" />)
    const { container: tinted } = render(<ProseSection blocks={blocks} treatment="tinted" />)
    expect(plain.querySelector('section')!.className).not.toContain('--warm-50')
    expect(tinted.querySelector('section')!.className).toContain('--warm-50')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/ProseSection.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```tsx
// components/proposals/sections/ProseSection.tsx
//
// COLOUR RULE: renders inside <ProposalTheme> on permanently-white paper. Use
// explicit var(--warm-N) literals only — never semantic tokens, which carry
// .dark overrides the warm ramp does not have.
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import type { SectionTreatment } from '@/lib/proposals/sections'
import type { ProposalBlock } from '@/lib/types'

/**
 * The measure-controlled prose band. Serves `prose`, `letter`, `logistics`,
 * and — until each gets its own authoring UI — `menu`, `day_plan` and `team`.
 *
 * The measure cap is load-bearing craft, not decoration: line length, widows
 * and orphans are layout-determined and therefore CANNOT be checked by the
 * send gate. They have to be guaranteed here or not at all.
 */
export function ProseSection({
  blocks,
  treatment,
  showPlaceholders = false,
}: {
  blocks?: ProposalBlock[]
  treatment: SectionTreatment
  showPlaceholders?: boolean
}) {
  const visible = (blocks ?? []).filter((b) => showPlaceholders || b.placeholder !== true)
  // The absence rule: an empty section renders nothing at all rather than an
  // empty band, so removing content changes the rhythm and not the integrity.
  if (visible.length === 0) return null

  return (
    <section
      className={[
        'w-full px-6 py-12 sm:py-16',
        treatment === 'tinted' ? 'bg-[var(--warm-50)]' : '',
      ].join(' ')}
    >
      <div
        data-measure
        className="mx-auto max-w-[68ch] text-pretty text-[var(--warm-700)] [text-wrap:pretty]"
      >
        <ProposalDocument blocks={visible} showPlaceholders={showPlaceholders} />
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/components/proposals/ProseSection.test.tsx --exclude '**/.claude/**'`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/proposals/sections/ProseSection.tsx __tests__/components/proposals/ProseSection.test.tsx
git commit -m "feat(proposals): measure-controlled prose section with computed treatment"
```

---

### Task 7: AA fixes on the pricing primitives

**Files:**
- Modify: `components/proposals/ProposalPricing.tsx`
- Test: `__tests__/components/proposals/ProposalPricing.test.tsx`

**Interfaces:** no signature changes — presentation only. `ProposalOptionalItems`, `ProposalIncludedItems`, `ProposalTotals` keep their existing props.

**Why:** spec §5.1 and §5.2. The add-on checkbox is 16px — on the literal upsell control — and the expiry line is `text-gray-400`, which is `#9ca3af` on white ≈ **2.5:1**.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/components/proposals/ProposalPricing.test.tsx`:

```tsx
describe('AA compliance', () => {
  const optional = [{ id: 'o1', description: 'Extra cart', quantity: 1, unit_price: 200, optional: true }]

  it('gives the add-on checkbox a 44px touch target', () => {
    const { container } = render(
      <ProposalOptionalItems items={optional} selectedIds={[]} onToggle={() => {}} />,
    )
    const box = container.querySelector('input[type="checkbox"]')!
    expect(box.className).toContain('size-[44px]')
  })

  it('does not use gray-400 for the expiry line', () => {
    const { container } = render(
      <ProposalTotals total={{ min: 100, max: 100 }} expiresAt="2026-12-01" />,
    )
    expect(container.innerHTML).not.toContain('text-gray-400')
  })

  it('still states the expiry date', () => {
    render(<ProposalTotals total={{ min: 100, max: 100 }} expiresAt="2026-12-01" />)
    expect(screen.getByText(/expires/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/ProposalPricing.test.tsx --exclude '**/.claude/**'`
Expected: FAIL on the first two assertions.

- [ ] **Step 3: Apply the fixes**

In `components/proposals/ProposalOptionalItems`, replace the checkbox `className`:

```tsx
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={disabled}
                  onChange={() => onToggle(id)}
                  /* 44px, not 16px: WCAG 2.2 AA target-size minimum is 24px and
                     the touch bar is 44. This is the upsell control on a
                     phone-first customer document — the single control most
                     responsible for average job value. */
                  className="size-[44px] shrink-0 rounded border-[var(--warm-300)] accent-[var(--proposal-accent,#111827)]"
                />
```

In `ProposalTotals`, replace the expiry paragraph. `--warm-600` is the lightest step that clears 4.5:1 on white, and expiry is decision-relevant information, not a footnote:

```tsx
      {expiresAt && (
        <p className="mt-1 text-sm font-medium text-[var(--warm-600)]">
          {/* Rendered from the same instant the signing/deposit guards use
              (proposalExpiryInstant), so a date-only expires_at never shows a
              date the guards would already treat as expired, or vice versa.
              Was text-gray-400 — #9ca3af on white is ~2.5:1 and fails AA. */}
          This proposal expires{' '}
          {new Date(proposalExpiryInstant(expiresAt)).toLocaleDateString()}
        </p>
      )}
```

Also update the `ProposalOptionalItems` label wrapper so the whole row is the hit area rather than just the box:

```tsx
              <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 text-[var(--warm-900)]">
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/components/proposals/ProposalPricing.test.tsx --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/proposals/ProposalPricing.tsx __tests__/components/proposals/ProposalPricing.test.tsx
git commit -m "fix(proposals): AA target size on add-ons and readable expiry ink"
```

---

### Task 8: The shared composition

**Files:**
- Create: `components/proposals/ProposalComposition.tsx`
- Test: `__tests__/components/proposals/ProposalComposition.test.tsx`

**Interfaces:**
- Consumes: `sectionsFromProposal`, `sectionTreatments`, `CoverSection`, `ProseSection`.
- Produces: `ProposalComposition` — props `{ proposal; branding?; clientName?; showPlaceholders?; renderDerived: (type: ProposalSectionType, treatment: SectionTreatment) => ReactNode }`.

**Why the `renderDerived` prop:** the public page's derived sections are interactive (tier selection, add-on checkboxes, the sign form and Stripe); print's are static. Injecting them keeps **one ordering and one treatment computation** while letting each surface own its own interactivity — this is what finally lets print and public share a composition instead of duplicating it.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/proposals/ProposalComposition.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProposalComposition } from '@/components/proposals/ProposalComposition'

const legacy = {
  title: 'Launch Party',
  line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
  blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Legacy body' }],
  terms: 'Legal text',
}

describe('ProposalComposition', () => {
  it('renders a legacy proposal with no sections field', () => {
    render(<ProposalComposition proposal={legacy} renderDerived={() => null} />)
    expect(screen.getByText('Legacy body')).toBeInTheDocument()
  })

  it('asks the host to render each derived section, in order', () => {
    const renderDerived = vi.fn().mockReturnValue(null)
    render(<ProposalComposition proposal={legacy} renderDerived={renderDerived} />)
    const types = renderDerived.mock.calls.map((c) => c[0])
    expect(types).toContain('investment')
    expect(types).toContain('accept')
    expect(types.indexOf('terms')).toBeGreaterThan(types.indexOf('accept'))
  })

  it('renders a cover section when branding supplies one', () => {
    render(
      <ProposalComposition
        proposal={{ ...legacy, sections: [{ id: 's1', type: 'cover' as const }] }}
        branding={{ logo_url: 'https://x/l.png' }}
        renderDerived={() => null}
      />,
    )
    expect(screen.getByTestId('proposal-cover')).toBeInTheDocument()
  })

  it('passes a treatment to every derived section it asks for', () => {
    const renderDerived = vi.fn().mockReturnValue(null)
    render(<ProposalComposition proposal={legacy} renderDerived={renderDerived} />)
    for (const call of renderDerived.mock.calls) {
      expect(['plain', 'tinted', 'bleed']).toContain(call[1])
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/ProposalComposition.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```tsx
// components/proposals/ProposalComposition.tsx
//
// The SINGLE ordered-archetype composition. The public page, the print route
// and the builder canvas all render through this, which is what stops the
// three from drifting apart — see the header of ProposalPricing.tsx for what
// happened the last time a composition was written twice.
//
// COLOUR RULE: permanently-white paper. Explicit var(--warm-N) only.
import type { ReactNode } from 'react'
import { sectionsFromProposal, sectionTreatments, type SectionTreatment } from '@/lib/proposals/sections'
import { CoverSection } from '@/components/proposals/sections/CoverSection'
import { ProseSection } from '@/components/proposals/sections/ProseSection'
import type { OrgBranding, Proposal, ProposalSectionType } from '@/lib/types'

type CompositionProposal = Pick<
  Proposal,
  'title' | 'sections' | 'blocks' | 'packages' | 'line_items' | 'terms' | 'notes'
>

/** Archetypes rendered from Proposal fields; the host supplies these. */
const DERIVED = new Set<ProposalSectionType>([
  'tiers', 'add_ons', 'investment', 'accept', 'terms',
])

export function ProposalComposition({
  proposal,
  branding,
  clientName,
  eventDate,
  showPlaceholders = false,
  renderDerived,
}: {
  proposal: CompositionProposal
  branding?: OrgBranding
  clientName?: string
  eventDate?: string
  showPlaceholders?: boolean
  /** Interactive on the public page, static in print — see the plan's Task 8. */
  renderDerived: (type: ProposalSectionType, treatment: SectionTreatment) => ReactNode
}) {
  const sections = sectionsFromProposal(proposal)
  const treatments = sectionTreatments(sections)

  return (
    <>
      {sections.map((section, i) => {
        const treatment = treatments[i]

        if (DERIVED.has(section.type)) {
          return <div key={section.id}>{renderDerived(section.type, treatment)}</div>
        }

        if (section.type === 'cover') {
          return (
            <CoverSection
              key={section.id}
              title={proposal.title ?? ''}
              branding={branding}
              clientName={clientName}
              eventDate={eventDate}
            />
          )
        }

        // Every remaining archetype renders as measure-controlled prose until
        // its own authoring UI lands (see the plan's scope table). Shipping the
        // types and slots now means ordering, treatment and the future Typst
        // mapping are correct from day one and the layout is not re-cut later.
        return (
          <ProseSection
            key={section.id}
            blocks={section.blocks}
            treatment={treatment}
            showPlaceholders={showPlaceholders}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/components/proposals/ProposalComposition.test.tsx --exclude '**/.claude/**'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/proposals/ProposalComposition.tsx __tests__/components/proposals/ProposalComposition.test.tsx
git commit -m "feat(proposals): single ordered composition shared by public and print"
```

---

### Task 9: Adopt the composition on the public page

**Files:**
- Modify: `components/proposals/ProposalResponseClient.tsx`
- Modify: `actions/proposals-public.ts` (add `contact` to the `PublicProposal` allowlist)
- Test: `__tests__/components/proposals/ProposalResponseClient.test.tsx`

**Interfaces:**
- Consumes: `ProposalComposition`.
- Produces: no export changes. `PublicProposal` gains `contact?: { name?: string; email?: string }`.

**Changes:** replace the seven stacked `<Card>`s with composition-driven sections; move `terms` below the sign box; pre-fill signer name/email from the lead.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/components/proposals/ProposalResponseClient.test.tsx`:

```tsx
describe('document composition', () => {
  const proposal = {
    status: 'sent' as const,
    line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
    blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Body copy' }],
    terms: 'Legal terms text',
  }

  it('renders terms after the sign box, not above it', () => {
    const { container } = render(<ProposalResponseClient token="t" proposal={proposal as never} />)
    const html = container.innerHTML
    expect(html.indexOf('Legal terms text')).toBeGreaterThan(html.indexOf('Sign to accept'))
  })

  it('does not wrap document content in admin Card chrome', () => {
    const { container } = render(<ProposalResponseClient token="t" proposal={proposal as never} />)
    expect(container.querySelector('[data-slot="card-title"]')).toBeNull()
  })

  it('pre-fills the signer name and email from the lead contact', () => {
    render(
      <ProposalResponseClient
        token="t"
        proposal={{ ...proposal, contact: { name: 'Jane Smith', email: 'jane@example.com' } } as never}
      />,
    )
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith')
    expect(screen.getByLabelText(/email/i)).toHaveValue('jane@example.com')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/ProposalResponseClient.test.tsx --exclude '**/.claude/**'`
Expected: FAIL on all three.

- [ ] **Step 3: Add the contact to the public projection**

In `actions/proposals-public.ts`, add `contact` to the `PublicProposal` type and populate it from the lead in `getPublicProposal`. **Only `name` and `email`** — the lead document carries fields that must not reach an unauthenticated page:

```ts
  // Pre-fill only. The lead doc holds far more than this; the allowlist is the
  // boundary for an unauthenticated public page, so widen it deliberately or
  // not at all.
  contact?: { name?: string; email?: string }
```

- [ ] **Step 4: Rewrite the page body**

In `ProposalResponseClient`, seed the signer state from the contact:

```tsx
  const [signerName, setSignerName] = useState(proposal.contact?.name ?? '')
  const [signerEmail, setSignerEmail] = useState(proposal.contact?.email ?? '')
```

Then replace the `<div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">` block and every `<Card>` inside it with a single composition call. The derived renderer keeps all existing interactive markup — move the current `Card` *bodies* into it verbatim, minus the `Card`/`CardHeader`/`CardTitle` wrappers:

```tsx
      <ProposalComposition
        proposal={proposal}
        branding={branding}
        clientName={proposal.contact?.name}
        renderDerived={(type, treatment) => {
          const band = [
            'w-full px-6 py-12 sm:py-16',
            treatment === 'tinted' ? 'bg-[var(--warm-50)]' : '',
          ].join(' ')
          switch (type) {
            case 'tiers':
              return packaged ? (
                <section className={band}>
                  <div className="mx-auto max-w-3xl">
                    <h2 className="mb-6 text-2xl font-bold text-[var(--warm-950)]">Choose an option</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {/* existing ProposalPackageOption map, unchanged */}
                    </div>
                  </div>
                </section>
              ) : null
            case 'add_ons':
              return optionalItems.length > 0 ? (/* existing ProposalOptionalItems markup */) : null
            case 'investment':
              return (/* existing totals markup */)
            case 'accept':
              return (/* existing sign form / payment / finalizing / signed markup */)
            case 'terms':
              return proposal.terms ? (/* existing terms markup */) : null
            default:
              return null
          }
        }}
      />
```

Note the tier grid changes from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-3` — three ~200px cards at a 640px tablet width was a squeeze.

Remove the now-unused `Card`, `CardHeader`, `CardTitle`, `CardContent` imports.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run __tests__/components/proposals/ProposalResponseClient.test.tsx __tests__/components/proposals/ProposalResponseClient-terms.test.tsx --exclude '**/.claude/**'`
Expected: PASS. If the terms test asserts the old ordering, update it — the reorder is the intended change (spec §4.1).

- [ ] **Step 6: Commit**

```bash
git add components/proposals/ProposalResponseClient.tsx actions/proposals-public.ts __tests__/components/proposals/
git commit -m "feat(proposals): compose the customer document in decision-flow order"
```

---

### Task 10: Adopt the composition in print

**Files:**
- Modify: `app/(public)/proposals/[token]/print/page.tsx`
- Test: `__tests__/app/proposals-print.test.tsx` (create)

**Interfaces:** consumes `ProposalComposition`. No exports.

**Why:** this deletes the second copy of the composition. Every ordering rule now has exactly one implementation.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/app/proposals-print.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/actions/proposals-public', () => ({
  getPublicProposal: vi.fn().mockResolvedValue({
    status: 'sent',
    title: 'Launch Party',
    line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
    blocks: [{ id: 'b1', type: 'paragraph', text: 'Print body' }],
    terms: 'Legal text',
  }),
}))

import ProposalPrintPage from '@/app/(public)/proposals/[token]/print/page'

describe('print route', () => {
  it('renders document content through the shared composition', async () => {
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.getByText('Print body')).toBeInTheDocument()
  })

  it('orders terms after the accept section, matching the web page', async () => {
    const { container } = render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    const html = container.innerHTML
    expect(html.indexOf('Legal text')).toBeGreaterThan(html.indexOf('Total'))
  })

  it('still refuses a voided proposal', async () => {
    const { getPublicProposal } = await import('@/actions/proposals-public')
    vi.mocked(getPublicProposal).mockResolvedValueOnce({ status: 'voided' } as never)
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/app/proposals-print.test.tsx --exclude '**/.claude/**'`
Expected: FAIL on the ordering assertion (print currently renders terms last but accept never).

- [ ] **Step 3: Replace the print composition**

Keep the voided/declined/signed status gates exactly as they are — they are correct and load-bearing. Replace only the `<ProposalDocument>` + `<section>` run with:

```tsx
      <ProposalComposition
        proposal={proposal}
        branding={branding}
        renderDerived={(type) => {
          switch (type) {
            case 'tiers':
              return packages.length > 0 ? (/* existing static package grid */) : null
            case 'add_ons':
              return optionalItems.length > 0 ? (/* existing ProposalOptionalItems, read-only */) : null
            case 'investment':
              return (/* existing ProposalTotals section */)
            case 'accept':
              return null  // print has no sign box; the signed/declined banners already state status
            case 'terms':
              return proposal.terms ? (/* existing terms section */) : null
            default:
              return null
          }
        }}
      />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/app/proposals-print.test.tsx --exclude '**/.claude/**'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/proposals/[token]/print/page.tsx" __tests__/app/proposals-print.test.tsx
git commit -m "refactor(proposals): print renders through the shared composition"
```

---

### Task 11: The peak-end accepted state

**Files:**
- Create: `components/proposals/AcceptedState.tsx`
- Modify: `components/proposals/ProposalResponseClient.tsx`
- Test: `__tests__/components/proposals/AcceptedState.test.tsx`

**Interfaces:**
- Produces: `AcceptedState` — props `{ signerName: string; signedAt?: string; depositPaid: boolean; eventDate?: string; orgName?: string }`.

**Why:** spec §4 lens 5. The peak-end moment of the entire customer relationship currently renders as a `Card` that says "Signed". Norman's reflective layer is absent — no next step, no reassurance.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/proposals/AcceptedState.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AcceptedState } from '@/components/proposals/AcceptedState'

describe('AcceptedState', () => {
  it('confirms who signed', () => {
    render(<AcceptedState signerName="Jane Smith" depositPaid={false} />)
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
  })

  it('always states what happens next', () => {
    render(<AcceptedState signerName="Jane" depositPaid={false} />)
    expect(screen.getByTestId('whats-next')).toBeInTheDocument()
  })

  it('names the org when supplied', () => {
    render(<AcceptedState signerName="Jane" depositPaid orgName="BrewTrax Coffee" />)
    expect(screen.getByText(/BrewTrax Coffee/)).toBeInTheDocument()
  })

  it('confirms a paid deposit', () => {
    render(<AcceptedState signerName="Jane" depositPaid />)
    expect(screen.getByText(/deposit/i)).toBeInTheDocument()
  })

  it('does not claim a deposit is paid when it is not', () => {
    render(<AcceptedState signerName="Jane" depositPaid={false} />)
    expect(screen.queryByText(/deposit paid/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/proposals/AcceptedState.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```tsx
// components/proposals/AcceptedState.tsx
//
// COLOUR RULE: permanently-white paper. Explicit var(--warm-N) only.
//
// The peak-end moment of the whole relationship (spec §4, craft lens). What
// this replaces was a Card reading "Signed." — correct, and reflectively
// empty. Every branch here states what happens next, because the customer has
// just committed money and the only question they now have is "and then what?"

export function AcceptedState({
  signerName,
  signedAt,
  depositPaid,
  eventDate,
  orgName,
}: {
  signerName: string
  signedAt?: string
  depositPaid: boolean
  eventDate?: string
  orgName?: string
}) {
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-[68ch]">
        <h2 className="text-3xl font-bold text-[var(--warm-950)]">
          You&apos;re booked{eventDate ? ` for ${eventDate}` : ''}.
        </h2>
        <p className="mt-3 text-lg text-[var(--warm-700)]">
          Signed by <span className="font-semibold text-[var(--warm-950)]">{signerName}</span>
          {signedAt && <> on {new Date(signedAt).toLocaleDateString()}</>}.
          {depositPaid && ' Your deposit is paid.'}
        </p>

        <div data-testid="whats-next" className="mt-8 border-t border-[var(--warm-200)] pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--warm-600)]">
            What happens next
          </h3>
          <ul className="mt-3 space-y-2 text-[var(--warm-700)]">
            <li>
              {orgName ?? 'We'}&apos;ll be in touch to confirm the final details and timings.
            </li>
            <li>A copy of this signed proposal has been emailed to you for your records.</li>
            {!depositPaid && <li>We&apos;ll send the deposit request separately.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Use it in the `accept` derived branch**

In `ProposalResponseClient`'s `renderDerived`, replace the `signedInfo` Card branch with `<AcceptedState ... />`, keeping the existing `deposit_pending` pay-now block beneath it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run __tests__/components/proposals/ --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/proposals/AcceptedState.tsx components/proposals/ProposalResponseClient.tsx __tests__/components/proposals/AcceptedState.test.tsx
git commit -m "feat(proposals): peak-end accepted state that says what happens next"
```

---

### Task 12: Builder parity, full gates, and the responsive walkthrough

**Files:**
- Modify: `components/admin/proposal-builder/ProposalBuilderClient.tsx`
- Modify: `components/admin/proposal-builder/BlockCanvas.tsx`
- Modify: `lib/proposals/draft-core.ts`

**Interfaces:** `draft-core`'s clearable-field whitelist gains `sections` so autosave can persist it.

**Why:** the builder is documented as "the customer's exact rendering, edited in place." If the public page composes and the builder does not, the WYSIWYG guarantee is broken — which is the exact argument used to disqualify a separate PDF renderer.

- [ ] **Step 1: Let autosave persist sections**

In `lib/proposals/draft-core.ts`, add `'sections'` to `CLEARABLE_FIELDS`. **Verify** the full-state semantics still hold: an absent field means *cleared*, so a partial write would delete sections — this bit once already.

- [ ] **Step 2: Render the builder canvas through the composition**

In `ProposalBuilderClient`, render `<ProposalComposition showPlaceholders proposal={draft} branding={branding} renderDerived={...} />` where `renderDerived` returns the existing `PricingCanvas` / `TotalsCanvas` editors. The canvas keeps its editing chrome; only the ordering and treatment now come from the shared module.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS. Fix any builder test asserting the old block order — the reorder is intended.

- [ ] **Step 4: Run the build**

Run: `npx next build`
Expected: success. `tsc --noEmit` alone will not catch the `'use server'` type re-export trap; the build is the gate.

- [ ] **Step 5: Commit**

```bash
git add components/admin/proposal-builder/ lib/proposals/draft-core.ts
git commit -m "feat(proposals): builder canvas composes through the shared archetype layer"
```

- [ ] **Step 6: The responsive walkthrough — REQUIRED, not optional**

This surface has never been opened in a browser, and green tests have missed real defects on it three times. Deploy the branch to a Vercel preview (**not** local dev — the Turbopack worktree-root gotcha makes new files vanish locally) and walk `/proposals/<token>` and `/proposals/<token>/print` at **375, 768, and 1280** via `resize_window`.

Confirm at each width:
- The cover scrim is applied and the title is legible over a **bright** cover image.
- Tier cards do not squeeze at 768 (they should be 2-up, not 3-up).
- Add-on checkboxes are comfortably tappable at 375.
- The sticky footer does not consume more than ~25% of the 375 viewport, and the primary CTA is reachable without scrolling past the total.
- Terms render **below** the sign box.
- A proposal with **no** blocks, **no** packages and **no** add-ons still reads as a designed document, not a page with holes (the absence rule).
- The accepted state renders after signing.

Capture a screenshot at each width and attach them to the PR.

- [ ] **Step 7: Verify the gate blocks a bad send**

In the preview, create a proposal from a skeleton, leave a placeholder unfilled, and press Send. Confirm it is **refused** with a message naming the placeholder, and that the override path records a reason.

- [ ] **Step 8: Final commit and PR**

```bash
git add -A
git commit -m "docs(proposals): record increment 1 walkthrough evidence"
gh auth switch  # the default account 403s on this repo; the Lifewithmo account is required
gh pr create --title "Customer proposal document — increment 1 (foundation)" --body "Implements docs/superpowers/specs/2026-08-18-customer-proposal-document-design.md increment 1 foundation. Screenshots at 375/768/1280 attached."
```

---

## Self-Review

**Spec coverage.** §5.1 target size → Task 7. §5.2 expiry ink → Task 7. §5.3 hero scrim → Task 5. §5.5 responsive → Task 12 step 6. §5.6 empty state → Tasks 3 + 6 (absence rule) and verified in Task 12. §10 archetypes → Tasks 1–3, 8. §10.1 legacy migration → Task 2. §12 gate → Task 4. §15.1 absence rule → Task 3. §4.6 pre-fill → Task 9. Peak-end → Task 11. Print de-duplication → Task 10.

**Known gaps, deliberate and named:** §5.4 (real PDF) is the `inc1-typst` plan; §6A.2–3 full typographic system and font choice are `inc1-fonts`; §9.1 ambient loop and the `menu`/`day_plan`/`team`/`gallery` authoring UIs are `inc1-media`. Their **types and render slots ship here** so the layout is not re-cut. The blind-rank benchmark (§9.6) is unscheduled pending the user's keep-or-cut call.

**Type consistency.** `ProposalSection` / `ProposalSectionType` / `SectionTreatment` are defined in Task 1 and Task 3 and used unchanged in Tasks 8–12. `sectionsFromProposal` and `sectionTreatments` keep the same signatures throughout. `evaluateSendGate(p, now)` is two-arg everywhere. `SCRIM_CLASS` is exported from `CoverSection` and asserted in its own test only.
